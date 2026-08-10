import type { LoggerService } from "@backstage/backend-plugin-api";
import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import type {
  CodeHealthEvent,
  EventOutcome,
} from "../../../domain/entities/code_health_event";
import type { TrackedRepository } from "../../../domain/entities/tracked_repository";
import type { CredentialsResolver } from "../../../domain/services/credentials_resolver";
import type {
  CollectedFacts,
  CollectionWindow,
  CollectorContext,
  VcsCollector,
} from "../../../domain/services/vcs_collector";
import type { ProviderGateway } from "../../http/provider_gateway";
import type {
  GithubHistoryResponse,
  GithubPullRequestNode,
  GithubRateLimitNode,
  GithubSearchResponse,
  GithubWorkflowRunNode,
  GithubWorkflowRunsResponse,
} from "./github_node";

/** GraphQL connections reject anything above 100. */
const PAGE_SIZE = 100;

/** Guards against an unbounded loop if a cursor ever fails to advance. */
const MAX_PAGES = 25;

const RUN_OUTCOMES: ReadonlyMap<string, EventOutcome> = new Map([
  ["success", "succeeded"],
  ["failure", "failed"],
  ["timed_out", "failed"],
  ["startup_failure", "failed"],
  ["cancelled", "canceled"],
]);

const REVIEW_OUTCOMES: ReadonlyMap<string, EventOutcome> = new Map([
  ["APPROVED", "approved"],
  ["CHANGES_REQUESTED", "rejected"],
  ["COMMENTED", "no_vote"],
  ["DISMISSED", "no_vote"],
  ["PENDING", "waiting"],
]);

/**
 * `rateLimit` is requested on every document so the gateway can pace itself
 * from GitHub's own accounting rather than guessing. The allowance is reported
 * in the body, not in a header, which is why it has to be handed back
 * explicitly.
 */
const HISTORY_QUERY = `
query CodeHealthHistory($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $cursor: String) {
  rateLimit { limit remaining resetAt cost }
  repository(owner: $owner, name: $name) {
    databaseId
    isArchived
    defaultBranchRef {
      name
      target {
        ... on Commit {
          history(first: 100, since: $since, until: $until, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              oid
              messageHeadline
              committedDate
              additions
              deletions
              changedFilesIfAvailable
              url
              author { name email avatarUrl user { login avatarUrl url } }
            }
          }
        }
      }
    }
  }
}`;

const PULL_REQUEST_QUERY = `
query CodeHealthPullRequests($search: String!, $cursor: String) {
  rateLimit { limit remaining resetAt cost }
  search(query: $search, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        state
        createdAt
        closedAt
        mergedAt
        author { login avatarUrl url }
        reviews(first: 50) {
          nodes { id state submittedAt author { login avatarUrl url } }
        }
      }
    }
  }
}`;

const isoOrNull = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * GitHub's login is the stable identity; the commit e-mail is the fallback for
 * commits authored by someone with no linked account.
 */
const authorKey = (node: {
  user?: { login?: string };
  email?: string;
  name?: string;
}): string | null => {
  const value = node.user?.login ?? node.email ?? node.name;
  return value ? value.toLowerCase() : null;
};

/** `YYYY-MM-DD` in UTC, which is the granularity GitHub search accepts. */
const searchDate = (instant: Date): string => instant.toISOString().slice(0, 10);

export interface GithubCollectorOptions {
  readonly gateway: ProviderGateway;
  readonly credentials: CredentialsResolver;
  readonly logger: LoggerService;
  /** GraphQL endpoint. Defaults to `https://api.github.com/graphql`. */
  readonly graphqlUrl?: string;
  /** REST endpoint. Defaults to `https://api.github.com`. */
  readonly restUrl?: string;
}

/**
 * Reads a window of a GitHub repository's history.
 *
 * Commits come from the GraphQL commit history, which takes `since` and
 * `until` directly. Pull requests come from search, because the
 * `pullRequests` connection has no date filter at all. Workflow runs come from
 * REST, because GraphQL exposes check suites only per commit — asking there
 * would mean one request per commit rather than one per window.
 */
export class GithubCollector implements VcsCollector {
  readonly platform: Platform = "github";

  private readonly graphqlUrl: string;
  private readonly restUrl: string;

  constructor(private readonly options: GithubCollectorOptions) {
    this.graphqlUrl = options.graphqlUrl ?? "https://api.github.com/graphql";
    this.restUrl = options.restUrl ?? "https://api.github.com";
  }

  async collect(
    repository: TrackedRepository,
    window: CollectionWindow,
    context: CollectorContext,
  ): Promise<CollectedFacts> {
    const headers = await this.options.credentials.resolve(repository);

    const [history, pullRequests, runs] = await Promise.all([
      this.collectCommits(repository, window, headers, context),
      this.collectPullRequests(repository, window, headers, context),
      this.collectWorkflowRuns(repository, window, headers, context),
    ]);

    return {
      events: [...history.events, ...pullRequests, ...runs],
      repositoryFacts: history.facts,
    };
  }

  private async graphql<T>(
    body: { query: string; variables: Record<string, unknown> },
    headers: Record<string, string>,
    context: CollectorContext,
  ): Promise<T> {
    const response = await this.options.gateway.request(
      {
        url: this.graphqlUrl,
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      },
      context.budget,
    );

    const parsed = JSON.parse(response.body) as T & {
      data?: { rateLimit?: GithubRateLimitNode };
      errors?: readonly { message?: string }[];
    };

    this.reportRateLimit(parsed.data?.rateLimit);

    if (parsed.errors?.length) {
      // A GraphQL error arrives with HTTP 200, so the gateway cannot see it.
      // Letting it pass as an empty result would record the window as ingested
      // and lose that data permanently.
      throw new Error(
        `GitHub GraphQL error: ${parsed.errors.map((error) => error.message).join("; ")}`,
      );
    }

    return parsed;
  }

  private reportRateLimit(rateLimit: GithubRateLimitNode | undefined): void {
    if (!rateLimit) return;
    const resetAt = isoOrNull(rateLimit.resetAt);
    this.options.gateway.reportRateLimit(this.graphqlUrl, {
      ...(rateLimit.remaining === undefined ? {} : { remaining: rateLimit.remaining }),
      ...(rateLimit.limit === undefined ? {} : { limit: rateLimit.limit }),
      ...(resetAt === null ? {} : { resetAt: resetAt.getTime() }),
    });
  }

  private async collectCommits(
    repository: TrackedRepository,
    window: CollectionWindow,
    headers: Record<string, string>,
    context: CollectorContext,
  ): Promise<{ events: CodeHealthEvent[]; facts: CollectedFacts["repositoryFacts"] }> {
    const events: CodeHealthEvent[] = [];
    let cursor: string | null = null;
    let facts: CollectedFacts["repositoryFacts"];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body: GithubHistoryResponse = await this.graphql<GithubHistoryResponse>(
        {
          query: HISTORY_QUERY,
          variables: {
            owner: repository.owner,
            name: repository.name,
            since: window.from.toISOString(),
            until: window.to.toISOString(),
            cursor,
          },
        },
        headers,
        context,
      );

      const repositoryNode = body.data?.repository;
      if (!repositoryNode) break;

      facts = {
        defaultBranch: repositoryNode.defaultBranchRef?.name ?? repository.defaultBranch,
        externalId:
          repositoryNode.databaseId === undefined
            ? repository.externalId
            : String(repositoryNode.databaseId),
        ...(repositoryNode.isArchived === undefined ? {} : { archived: repositoryNode.isArchived }),
      };

      const history = repositoryNode.defaultBranchRef?.target?.history;
      for (const node of history?.nodes ?? []) {
        const occurredAt = isoOrNull(node?.committedDate);
        if (!node?.oid || !occurredAt) continue;

        events.push({
          repositoryId: repository.id,
          kind: "commit",
          externalId: node.oid,
          occurredAt,
          actorKey: authorKey(node.author ?? {}),
          actorName: node.author?.user?.login ?? node.author?.name ?? null,
          actorAvatarUrl: node.author?.user?.avatarUrl ?? node.author?.avatarUrl ?? null,
          outcome: null,
          additions: node.additions ?? null,
          deletions: node.deletions ?? null,
          changedFiles: node.changedFilesIfAvailable ?? null,
          payload: {
            messageHeadline: node.messageHeadline ?? null,
            url: node.url ?? null,
          },
        });
      }

      if (!history?.pageInfo?.hasNextPage) break;
      cursor = history.pageInfo.endCursor ?? null;
      if (!cursor) break;
    }

    return { events, facts };
  }

  private async collectPullRequests(
    repository: TrackedRepository,
    window: CollectionWindow,
    headers: Record<string, string>,
    context: CollectorContext,
  ): Promise<CodeHealthEvent[]> {
    const slug = `${repository.owner}/${repository.name}`;
    const range = `${searchDate(window.from)}..${searchDate(window.to)}`;

    const [opened, closed] = await Promise.all([
      this.searchPullRequests(
        repository,
        `repo:${slug} is:pr created:${range}`,
        "created",
        window,
        headers,
        context,
      ),
      this.searchPullRequests(
        repository,
        `repo:${slug} is:pr closed:${range}`,
        "closed",
        window,
        headers,
        context,
      ),
    ]);

    return [...opened, ...closed];
  }

  private async searchPullRequests(
    repository: TrackedRepository,
    search: string,
    range: "created" | "closed",
    window: CollectionWindow,
    headers: Record<string, string>,
    context: CollectorContext,
  ): Promise<CodeHealthEvent[]> {
    const events: CodeHealthEvent[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body: GithubSearchResponse = await this.graphql<GithubSearchResponse>(
        { query: PULL_REQUEST_QUERY, variables: { search, cursor } },
        headers,
        context,
      );

      for (const node of body.data?.search?.nodes ?? []) {
        if (!node?.number) continue;
        events.push(...this.pullRequestEvents(repository, node, range, window));
      }

      const pageInfo = body.data?.search?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      cursor = pageInfo.endCursor ?? null;
      if (!cursor) break;
    }

    return events;
  }

  private pullRequestEvents(
    repository: TrackedRepository,
    node: GithubPullRequestNode,
    range: "created" | "closed",
    window: CollectionWindow,
  ): CodeHealthEvent[] {
    const createdAt = isoOrNull(node.createdAt);
    const closedAt = isoOrNull(node.mergedAt ?? node.closedAt);
    const occurredAt = range === "created" ? createdAt : closedAt;

    // GitHub search filters by calendar day, so a window narrower than a day
    // comes back over-inclusive and has to be trimmed to the real bounds.
    if (!occurredAt || occurredAt < window.from || occurredAt >= window.to) return [];

    const closedOutcome: EventOutcome = node.mergedAt ? "merged" : "abandoned";

    const events: CodeHealthEvent[] = [
      {
        repositoryId: repository.id,
        kind: "pull_request",
        externalId: range === "created" ? String(node.number) : `${node.number}:closed`,
        occurredAt,
        actorKey: node.author?.login?.toLowerCase() ?? null,
        actorName: node.author?.login ?? null,
        actorAvatarUrl: node.author?.avatarUrl ?? null,
        outcome: range === "created" ? "open" : closedOutcome,
        additions: null,
        deletions: null,
        changedFiles: null,
        payload: {
          pullRequestNumber: node.number ?? null,
          title: node.title ?? null,
          state: node.state ?? null,
          createdAt: createdAt?.toISOString() ?? null,
          closedAt: closedAt?.toISOString() ?? null,
        },
      },
    ];

    if (range !== "closed") return events;

    for (const review of node.reviews?.nodes ?? []) {
      const login = review?.author?.login;
      if (!review?.id || !login) continue;

      events.push({
        repositoryId: repository.id,
        kind: "pr_review",
        externalId: review.id,
        occurredAt: isoOrNull(review.submittedAt) ?? occurredAt,
        actorKey: login.toLowerCase(),
        actorName: login,
        actorAvatarUrl: review.author?.avatarUrl ?? null,
        outcome: REVIEW_OUTCOMES.get(review.state ?? "") ?? "no_vote",
        additions: null,
        deletions: null,
        changedFiles: null,
        payload: { pullRequestNumber: node.number ?? null, state: review.state ?? null },
      });
    }

    return events;
  }

  private async collectWorkflowRuns(
    repository: TrackedRepository,
    window: CollectionWindow,
    headers: Record<string, string>,
    context: CollectorContext,
  ): Promise<CodeHealthEvent[]> {
    const events: CodeHealthEvent[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const parameters = new URLSearchParams({
        created: `${searchDate(window.from)}..${searchDate(window.to)}`,
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const url =
        `${this.restUrl}/repos/${encodeURIComponent(repository.owner)}/` +
        `${encodeURIComponent(repository.name)}/actions/runs?${parameters.toString()}`;

      let body: GithubWorkflowRunsResponse;
      try {
        const response = await this.options.gateway.request(
          {
            url,
            headers: { ...headers, Accept: "application/vnd.github+json" },
            ...(context.signal === undefined ? {} : { signal: context.signal }),
          },
          context.budget,
        );
        body = JSON.parse(response.body) as GithubWorkflowRunsResponse;
      } catch (error) {
        // A repository with Actions disabled answers 404 here. That is a normal
        // configuration, not a failure of the window, so the rest of the
        // collected facts are still worth keeping.
        this.options.logger.debug(
          `no workflow runs for ${repository.entityRef}: ${String(error)}`,
        );
        break;
      }

      const runs = body.workflow_runs ?? [];
      for (const run of runs) {
        const event = this.runEvent(repository, run, window);
        if (event) events.push(event);
      }

      if (runs.length < PAGE_SIZE) break;
    }

    return events;
  }

  private runEvent(
    repository: TrackedRepository,
    run: GithubWorkflowRunNode,
    window: CollectionWindow,
  ): CodeHealthEvent | null {
    const occurredAt = isoOrNull(run.updated_at ?? run.run_started_at ?? run.created_at);
    if (run.id === undefined || !occurredAt) return null;
    // `created:` filters by calendar day, so trim to the real window bounds.
    if (occurredAt < window.from || occurredAt >= window.to) return null;

    return {
      repositoryId: repository.id,
      kind: "build",
      externalId: String(run.id),
      occurredAt,
      actorKey: run.actor?.login?.toLowerCase() ?? null,
      actorName: run.actor?.login ?? null,
      actorAvatarUrl: run.actor?.avatar_url ?? null,
      outcome: RUN_OUTCOMES.get(run.conclusion ?? "") ?? null,
      additions: null,
      deletions: null,
      changedFiles: null,
      payload: {
        workflow: run.name ?? null,
        branch: run.head_branch ?? null,
        status: run.status ?? null,
        conclusion: run.conclusion ?? null,
        url: run.html_url ?? null,
      },
    };
  }
}
