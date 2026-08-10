import type { ContributorSummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { computeRate } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../entities/code_health_event";
import { toDay } from "../entities/day";
import type { CodeHealthStore } from "../repositories/code_health_store";

interface Accumulator {
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  changedFiles: number;
  pullRequestsOpened: number;
  pullRequestsMerged: number;
  reviewsGiven: number;
  reviewsApproved: number;
  reviewsRejected: number;
  pipelineRuns: number;
  pipelineRunsSucceeded: number;
  repositories: Set<string>;
}

const empty = (key: string): Accumulator => ({
  displayName: key,
  avatarUrl: null,
  profileUrl: null,
  commits: 0,
  linesAdded: 0,
  linesDeleted: 0,
  changedFiles: 0,
  pullRequestsOpened: 0,
  pullRequestsMerged: 0,
  reviewsGiven: 0,
  reviewsApproved: 0,
  reviewsRejected: 0,
  pipelineRuns: 0,
  pipelineRunsSucceeded: 0,
  repositories: new Set(),
});

const applyEvent = (accumulator: Accumulator, event: CodeHealthEvent): void => {
  accumulator.repositories.add(event.repositoryId);
  if (event.actorName) accumulator.displayName = event.actorName;
  if (event.actorAvatarUrl) accumulator.avatarUrl = event.actorAvatarUrl;

  switch (event.kind) {
    case "commit":
      accumulator.commits += 1;
      accumulator.linesAdded += event.additions ?? 0;
      accumulator.linesDeleted += event.deletions ?? 0;
      accumulator.changedFiles += event.changedFiles ?? 0;
      break;
    case "pull_request":
      if (event.outcome === "open") accumulator.pullRequestsOpened += 1;
      if (event.outcome === "merged") accumulator.pullRequestsMerged += 1;
      break;
    case "pr_review":
      accumulator.reviewsGiven += 1;
      if (event.outcome === "approved" || event.outcome === "approved_with_suggestions") {
        accumulator.reviewsApproved += 1;
      }
      if (event.outcome === "rejected") accumulator.reviewsRejected += 1;
      break;
    case "build":
      accumulator.pipelineRuns += 1;
      if (event.outcome === "succeeded") accumulator.pipelineRunsSucceeded += 1;
      break;
    default:
      break;
  }
};

export class ListContributorSummaries {
  constructor(private readonly store: CodeHealthStore) {}

  /**
   * Groups a window's events by contributor.
   *
   * Contributors are keyed by the normalised identity every event already
   * carries — the commit author e-mail on Azure DevOps, the login on GitHub —
   * so the same person under two addresses appears twice. Mapping identities is
   * the catalog's job, and inventing a heuristic here would silently merge two
   * people who happen to share a display name.
   */
  async run(input: {
    from: Date;
    to: Date;
    repositoryId?: string;
  }): Promise<ContributorSummary[]> {
    const [events, wakaTime] = await Promise.all([
      this.store.listEvents({
        from: input.from,
        to: input.to,
        ...(input.repositoryId === undefined ? {} : { repositoryIds: [input.repositoryId] }),
      }),
      this.store.listLatestContributorMetrics(toDay(input.to)),
    ]);

    const byContributor = new Map<string, Accumulator>();
    for (const event of events) {
      if (!event.actorKey) continue;
      const existing = byContributor.get(event.actorKey) ?? empty(event.actorKey);
      applyEvent(existing, event);
      byContributor.set(event.actorKey, existing);
    }

    return [...byContributor.entries()]
      .map(([key, totals]) => ({
        key,
        displayName: totals.displayName,
        avatarUrl: totals.avatarUrl,
        profileUrl: totals.profileUrl,
        commits: totals.commits,
        linesAdded: totals.linesAdded,
        linesDeleted: totals.linesDeleted,
        // Floored at zero: a window in which someone mostly deleted code is a
        // legitimate contribution, not a negative one.
        linesOfCode: Math.max(0, totals.linesAdded - totals.linesDeleted),
        changedFiles: totals.changedFiles,
        pullRequestsOpened: totals.pullRequestsOpened,
        pullRequestsMerged: totals.pullRequestsMerged,
        reviewsGiven: totals.reviewsGiven,
        reviewsApproved: totals.reviewsApproved,
        reviewsRejected: totals.reviewsRejected,
        prApprovalRate: computeRate(totals.reviewsApproved, totals.reviewsGiven),
        pipelineRuns: totals.pipelineRuns,
        pipelineRunsSucceeded: totals.pipelineRunsSucceeded,
        pipelineSuccessRate: computeRate(totals.pipelineRunsSucceeded, totals.pipelineRuns),
        repositories: totals.repositories.size,
        sonarMetrics: null,
        wakaTimeMetrics: wakaTime.get(key) ?? null,
      }))
      .sort((left, right) => right.commits - left.commits);
  }
}
