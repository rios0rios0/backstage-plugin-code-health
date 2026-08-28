import type { LoggerService } from "@backstage/backend-plugin-api";
import type {
  JiraContributorMetrics,
  JiraPriorityCount,
  JiraRepositoryMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { addDays, startOfDay, toDay, type Day } from "../../../domain/entities/day";
import { normalizeSourceKey } from "../../../domain/entities/identity";
import type { JiraSettings } from "../../../domain/entities/jira_settings";
import { BudgetExhaustedError } from "../../../domain/entities/request_budget";
import type { TrackedRepository } from "../../../domain/entities/tracked_repository";
import type {
  IdentityObserver,
  ObservedIdentity,
} from "../../../domain/services/identity_resolver";
import type { JiraEnricher } from "../../../domain/services/jira_enricher";
import type { EnrichmentContext } from "../../../domain/services/snapshot_enricher";
import type { AtlassianClient } from "./atlassian_client";
import type {
  JiraAccount,
  JiraApproximateCountResponse,
  JiraFieldDescriptor,
  JiraIssueFacts,
  JiraPriorityDescriptor,
  JiraScope,
  JiraSearchResponse,
  JiraStatusCategory,
  JiraStatusDescriptor,
} from "./jira_queries";
import {
  buildActivityJql,
  buildOldestOpenJql,
  buildOpenByPriorityJql,
  buildOpenIssuesJql,
  buildStatusCategories,
  parseIssue,
  resolveStoryPointsField,
  scopeKey,
  tallyContributors,
  tallyRepository,
  toOpenIssue,
} from "./jira_queries";

/** GraphQL-free, but the enhanced search still caps a page at 100 issues. */
const PAGE_SIZE = 100;

/**
 * Fields asked for by name, because the enhanced search returns almost nothing
 * by default.
 *
 * `comment` and `worklog` are the expensive two and are requested anyway: they
 * are the only way to count what a person actually did on an issue, since Jira
 * has no JQL for "commented by" outside a paid add-on and asking per issue
 * would be one request per issue. The site caps what it returns for both, which
 * is why {@link JiraIssueFacts.truncated} exists rather than the counts being
 * presented as complete.
 */
const BASE_FIELDS: readonly string[] = [
  "summary",
  "created",
  "resolutiondate",
  "issuetype",
  "status",
  "priority",
  "reporter",
  "creator",
  "assignee",
  "comment",
  "worklog",
];

/**
 * More priorities than this and the breakdown stops being a chart.
 *
 * It is also a cost ceiling: each bucket is its own count request, per project.
 */
const MAX_PRIORITY_BUCKETS = 8;

/**
 * Requests kept back before the per-priority counts are attempted.
 *
 * They are the least valuable thing this enricher fetches and the only part
 * whose cost multiplies by both the project count and the priority count, so
 * they are what gets dropped when a run is running out of allowance. An empty
 * breakdown renders as nothing at all, which is the correct thing for a
 * measurement that was not taken.
 */
const PRIORITY_BUDGET_RESERVE = 40;

interface ScopedRepositories {
  readonly scope: JiraScope;
  readonly repositoryIds: readonly string[];
}

/** Everything one run learned, so the two port methods scan Jira only once. */
interface RunScan {
  readonly window: { from: Date; to: Date };
  readonly issuesByScope: ReadonlyMap<string, readonly JiraIssueFacts[]>;
  readonly storyPointsField: string | null;
  readonly categories: ReadonlyMap<string, JiraStatusCategory>;
}

/**
 * Repositories grouped by the Jira slice their entity names.
 *
 * A repository whose entity carries no `jira/project-key` is dropped rather
 * than defaulted: several repositories legitimately track no work in Jira, and
 * guessing a project for them would put somebody else's numbers on their row.
 */
export const groupByScope = (
  repositories: readonly TrackedRepository[],
): ScopedRepositories[] => {
  const groups = new Map<string, { scope: JiraScope; repositoryIds: string[] }>();

  for (const repository of repositories) {
    const projectKey = repository.catalogFacts.jiraProjectKey;
    if (projectKey === null || projectKey.trim() === "") continue;

    const scope: JiraScope = {
      projectKey: projectKey.trim(),
      component: repository.catalogFacts.jiraComponent?.trim() || null,
    };
    const key = scopeKey(scope);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { scope, repositoryIds: [repository.id] });
    } else {
      existing.repositoryIds.push(repository.id);
    }
  }

  return [...groups.values()];
};

export interface JiraApiEnricherOptions {
  readonly client: AtlassianClient;
  readonly settings: JiraSettings;
  /** Site root, e.g. `https://acme.atlassian.net`, for profile links. */
  readonly baseUrl: string | null;
  /**
   * The repositories the catalog tracks.
   *
   * Injected as a callback because {@link JiraEnricher.fetchContributors} is
   * asked for the whole fleet at once and is handed no repositories — yet the
   * only legitimate source of project keys is the catalog, exactly as it is the
   * only legitimate source of repositories. Enumerating the site's projects
   * instead would reintroduce the "list the whole organisation on every run"
   * behaviour the gateway exists to stop.
   */
  readonly listRepositories: () => Promise<readonly TrackedRepository[]>;
  readonly identities: IdentityObserver;
  readonly logger: LoggerService;
  /** Injected so the window a run measures is fixed for the whole run. */
  readonly now?: () => Date;
}

/**
 * Reads delivery measures out of Jira Cloud.
 *
 * Jira is the one enriched source here that answers historically — Sonar,
 * compliance and badges only ever describe the present — so the run measures a
 * trailing window of {@link JiraSettings.historyDays} rather than a single day,
 * and every value carries the window it covers.
 *
 * The window is expressed in whole UTC days and derived from the day the run
 * belongs to, not from the instant each method was called. That is what lets
 * `fetchContributors` and `fetchRepositories` agree on a cache key: the two are
 * called back to back on the same run, they need the same issues, and scanning
 * Jira twice for one snapshot would double the most expensive thing this
 * plugin does.
 *
 * Three site-wide lookups happen once per run and are cached with the scan: the
 * custom field story points live on, the status-id-to-category map the
 * changelog has to be read through, and the site's priority names. Without the
 * second there is no honest cycle time at all — the changelog reports status
 * *names*, which any team can rename, and only the category is Jira's own.
 */
export class JiraApiEnricher implements JiraEnricher {
  private scan: RunScan | null = null;
  private scanKey: string | null = null;
  private categories: ReadonlyMap<string, JiraStatusCategory> | null = null;
  private priorities: readonly string[] | null = null;

  constructor(private readonly options: JiraApiEnricherOptions) {}

  async fetchContributors(
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, JiraContributorMetrics>> {
    const scan = await this.ensureScan(context);
    if (scan === null) return new Map();

    const issues = [...scan.issuesByScope.values()].flat();
    return tallyContributors(issues, scan.window, {
      storyPointsResolved: scan.storyPointsField !== null,
    });
  }

  /**
   * The same window sliced into calendar days, at no extra request cost.
   *
   * The issues were already fetched for the whole window, so a per-day tally is
   * arithmetic rather than traffic. It exists because a range picker offering
   * "last March" deserves March's answer rather than a trailing ninety days
   * relabelled, and Jira — unlike Sonar — genuinely knows what March looked
   * like.
   */
  async fetchContributorsByDay(
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<Day, ReadonlyMap<string, JiraContributorMetrics>>> {
    const scan = await this.ensureScan(context);
    if (scan === null) return new Map();

    const issues = [...scan.issuesByScope.values()].flat();
    const byDay = new Map<Day, ReadonlyMap<string, JiraContributorMetrics>>();

    for (
      let day = toDay(scan.window.from);
      day < toDay(scan.window.to);
      day = addDays(day, 1)
    ) {
      const window = { from: startOfDay(day), to: startOfDay(addDays(day, 1)) };
      const tallies = tallyContributors(issues, window, {
        storyPointsResolved: scan.storyPointsField !== null,
      });
      // Days nobody touched are left out rather than stored as empty maps: the
      // store distinguishes "no activity" from "not collected" by row presence,
      // and writing empty days would erase that distinction.
      if (tallies.size > 0) byDay.set(day, tallies);
    }

    return byDay;
  }

  async fetchRepositories(
    repositories: readonly TrackedRepository[],
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, JiraRepositoryMetrics>> {
    const scan = await this.ensureScan(context);
    if (scan === null) return new Map();

    const result = new Map<string, JiraRepositoryMetrics>();
    const now = this.now();

    for (const { scope, repositoryIds } of groupByScope(repositories)) {
      const issues = scan.issuesByScope.get(scopeKey(scope));
      if (issues === undefined) continue;

      const extras = await this.fetchOpenIssueFacts(scope, scan, context, now);
      const metrics = tallyRepository(issues, scope, scan.window, {
        ...extras,
        storyPointsResolved: scan.storyPointsField !== null,
      });

      // One project's answer, handed to every repository that names it. The
      // alternative — querying per repository — downloads one identical payload
      // once per repository, which is the mistake Azure DevOps branch policies
      // used to make here.
      for (const repositoryId of repositoryIds) result.set(repositoryId, metrics);
    }

    return result;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /**
   * The window a run measures, in whole UTC days.
   *
   * It runs to the end of the current day rather than to the calling instant so
   * that two methods invoked seconds apart derive the same window — which is
   * what makes the scan cacheable — and so that the window aligns with the
   * `Day` keys everything else in this plugin is stored under.
   */
  private windowFor(now: Date): { from: Date; to: Date } {
    const today = toDay(now);
    return {
      from: startOfDay(addDays(today, 1 - Math.max(1, this.options.settings.historyDays))),
      to: startOfDay(addDays(today, 1)),
    };
  }

  private async ensureScan(context: EnrichmentContext): Promise<RunScan | null> {
    if (!this.options.settings.enabled) return null;

    const window = this.windowFor(this.now());
    const key = `${window.from.toISOString()}|${window.to.toISOString()}`;
    if (this.scanKey === key && this.scan !== null) return this.scan;

    const scopes = groupByScope(await this.options.listRepositories());
    if (scopes.length === 0) {
      // Nothing in the catalog names a Jira project, so there is nothing to
      // measure and no request worth spending to discover that.
      this.options.logger.debug(
        "no catalog entity carries a jira/project-key annotation; skipping Jira",
      );
      return null;
    }

    const [storyPointsField, categories] = await Promise.all([
      this.resolveStoryPoints(context),
      this.resolveCategories(context),
    ]);

    if (storyPointsField === null) {
      // Said once per run rather than per project, and said at all because the
      // alternative is a column of em dashes nobody can explain.
      this.options.logger.info(
        "no Jira story-point field was found; story-point measures will be reported " +
          "as unmeasured. Pin it with codeHealth.atlassian.jira.storyPointsField",
      );
    }

    const issuesByScope = new Map<string, readonly JiraIssueFacts[]>();
    const accounts = new Map<string, JiraAccount>();

    for (const { scope } of scopes) {
      if (context.signal?.aborted) break;
      try {
        const issues = await this.scanScope(scope, window, storyPointsField, categories, context);
        issuesByScope.set(scopeKey(scope), issues);
        for (const issue of issues) {
          for (const account of issue.accounts) accounts.set(account.accountId, account);
        }
      } catch (error) {
        if (error instanceof BudgetExhaustedError) {
          // The run stops where it is rather than retrying: the projects it did
          // reach are measured, and the next run starts with a fresh allowance.
          this.options.logger.info(
            `Jira scan stopped after ${error.spent} requests; ` +
              `${issuesByScope.size} of ${scopes.length} projects were measured`,
          );
          break;
        }
        this.options.logger.warn(
          `could not read Jira project ${scope.projectKey}: ${String(error)}`,
        );
      }
    }

    await this.observe(accounts);

    this.scan = { window, issuesByScope, storyPointsField, categories };
    this.scanKey = key;
    return this.scan;
  }

  private async observe(accounts: ReadonlyMap<string, JiraAccount>): Promise<void> {
    if (accounts.size === 0) return;

    const identities: ObservedIdentity[] = [...accounts.values()].map((account) => ({
      source: "jira",
      sourceKey: normalizeSourceKey(account.accountId),
      displayName: account.displayName,
      // Present only when the person made their address visible; GDPR-era Jira
      // omits it on most endpoints, which is precisely why the accountId rather
      // than the e-mail is the source key.
      email: account.email,
      avatarUrl: account.avatarUrl,
      profileUrl:
        this.options.baseUrl === null
          ? null
          : `${this.options.baseUrl}/jira/people/${encodeURIComponent(account.rawAccountId)}`,
    }));

    try {
      await this.options.identities.observe(identities, this.now());
    } catch (error) {
      // Losing the identity record costs a row on an admin screen; failing the
      // snapshot over it would cost the whole day's measurements.
      this.options.logger.warn(`could not record Jira identities: ${String(error)}`);
    }
  }

  private async scanScope(
    scope: JiraScope,
    window: { from: Date; to: Date },
    storyPointsField: string | null,
    categories: ReadonlyMap<string, JiraStatusCategory>,
    context: EnrichmentContext,
  ): Promise<JiraIssueFacts[]> {
    const fields = [
      ...BASE_FIELDS,
      ...(storyPointsField === null ? [] : [storyPointsField]),
    ];
    const jql = buildActivityJql(scope, window, this.options.settings.filter);

    const nodes = await this.options.client.paginate({
      context,
      limit: this.options.settings.maxIssuesPerProject,
      fetchPage: async (cursor) => {
        const response = await this.options.client.post<JiraSearchResponse>(
          "/rest/api/3/search/jql",
          {
            jql,
            fields,
            // The changelog is what carries transitions, and transitions are
            // what carry both the interaction counts and the moment work
            // started. Expanding it here costs nothing extra — asking for it
            // afterwards would be one request per issue.
            expand: "changelog",
            maxResults: PAGE_SIZE,
            ...(cursor === null ? {} : { nextPageToken: cursor }),
          },
          context,
        );

        return {
          items: response.issues ?? [],
          next: response.isLast === true ? null : (response.nextPageToken ?? null),
        };
      },
    });

    return nodes.flatMap((node) => {
      const facts = parseIssue(node, { storyPointsField, categories });
      return facts === null ? [] : [facts];
    });
  }

  /**
   * The backlog, which is the one figure here that is deliberately not
   * windowed.
   *
   * "How many issues are open" is a present-tense fact. Answering it for a past
   * window would mean replaying every status change on the site, which Jira
   * will not do and this plugin should not attempt.
   */
  private async fetchOpenIssueFacts(
    scope: JiraScope,
    scan: RunScan,
    context: EnrichmentContext,
    now: Date,
  ): Promise<{
    openIssues: number | null;
    oldestOpenIssue: ReturnType<typeof toOpenIssue>;
    openByPriority: readonly JiraPriorityCount[];
  }> {
    const filter = this.options.settings.filter;

    try {
      const [openIssues, oldest] = await Promise.all([
        this.count(buildOpenIssuesJql(scope, filter), context),
        this.oldestOpen(scope, scan, context),
      ]);

      return {
        openIssues,
        oldestOpenIssue: toOpenIssue(oldest, now),
        openByPriority: await this.countByPriority(scope, context),
      };
    } catch (error) {
      this.options.logger.debug(
        `no Jira backlog figures for ${scope.projectKey}: ${String(error)}`,
      );
      return { openIssues: null, oldestOpenIssue: null, openByPriority: [] };
    }
  }

  private async count(jql: string, context: EnrichmentContext): Promise<number | null> {
    // The enhanced search reports no total at all, unlike the endpoint it
    // replaced, so a count is its own request rather than a field on a page.
    const response = await this.options.client.post<JiraApproximateCountResponse>(
      "/rest/api/3/search/approximate-count",
      { jql },
      context,
    );
    return typeof response.count === "number" ? response.count : null;
  }

  private async oldestOpen(
    scope: JiraScope,
    scan: RunScan,
    context: EnrichmentContext,
  ): Promise<JiraIssueFacts | null> {
    const response = await this.options.client.post<JiraSearchResponse>(
      "/rest/api/3/search/jql",
      {
        jql: buildOldestOpenJql(scope, this.options.settings.filter),
        fields: ["summary", "created"],
        maxResults: 1,
      },
      context,
    );

    const [node] = response.issues ?? [];
    if (node === undefined) return null;
    return parseIssue(node, {
      storyPointsField: scan.storyPointsField,
      categories: scan.categories,
    });
  }

  private async countByPriority(
    scope: JiraScope,
    context: EnrichmentContext,
  ): Promise<readonly JiraPriorityCount[]> {
    const priorities = await this.resolvePriorities(context);
    if (priorities.length === 0) return [];

    if (context.budget.remaining < PRIORITY_BUDGET_RESERVE + priorities.length) {
      this.options.logger.debug(
        `skipping the Jira priority breakdown for ${scope.projectKey} to leave ` +
          "the run's remaining allowance for the measurements that need it",
      );
      return [];
    }

    const counts = await Promise.all(
      priorities.map(async (name) => ({
        name,
        count: await this.count(
          buildOpenByPriorityJql(scope, name, this.options.settings.filter),
          context,
        ),
      })),
    );

    return counts.flatMap((entry) =>
      entry.count === null || entry.count === 0 ? [] : [{ name: entry.name, count: entry.count }],
    );
  }

  private async resolveStoryPoints(context: EnrichmentContext): Promise<string | null> {
    const pinned = this.options.settings.storyPointsField;
    if (pinned !== null && pinned.trim() !== "") return pinned.trim();

    try {
      const fields = await this.options.client.get<readonly JiraFieldDescriptor[]>(
        "/rest/api/3/field",
        context,
      );
      return resolveStoryPointsField(fields, null);
    } catch (error) {
      this.options.logger.warn(`could not list Jira fields: ${String(error)}`);
      return null;
    }
  }

  private async resolveCategories(
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, JiraStatusCategory>> {
    if (this.categories !== null) return this.categories;

    try {
      const statuses = await this.options.client.get<readonly JiraStatusDescriptor[]>(
        "/rest/api/3/status",
        context,
      );
      this.categories = buildStatusCategories(statuses);
    } catch (error) {
      // Everything degrades to a lead time computed from `created` and
      // `resolutiondate`, which the issue carries directly. Cycle time is the
      // casualty, and reporting it as unmeasured is better than reporting one
      // derived from status names a site is free to have renamed.
      this.options.logger.warn(
        `could not read Jira statuses, so cycle time will be unmeasured: ${String(error)}`,
      );
      this.categories = new Map();
    }

    return this.categories;
  }

  private async resolvePriorities(context: EnrichmentContext): Promise<readonly string[]> {
    if (this.priorities !== null) return this.priorities;

    try {
      const descriptors = await this.options.client.get<readonly JiraPriorityDescriptor[]>(
        "/rest/api/3/priority",
        context,
      );
      const names = descriptors.flatMap((priority) =>
        priority.name === undefined ? [] : [priority.name],
      );
      this.priorities = names.length > MAX_PRIORITY_BUCKETS ? [] : names;
    } catch (error) {
      this.options.logger.debug(`could not list Jira priorities: ${String(error)}`);
      this.priorities = [];
    }

    return this.priorities;
  }
}

