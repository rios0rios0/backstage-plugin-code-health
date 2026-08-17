import type { SonarMetrics } from "./sonar_metrics";
import type { WakaTimeMetrics } from "./wakatime_metrics";

/**
 * One row of the contributors dashboard, aggregated from the events inside the
 * requested window.
 *
 * Contributors are keyed by `key`, a normalised commit author identity — the
 * author e-mail lowercased on Azure DevOps, the login on GitHub. The same human
 * committing under two addresses therefore appears twice; mapping identities is
 * the catalog's job, not this plugin's.
 */
export interface ContributorSummary {
  readonly key: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly profileUrl: string | null;
  /**
   * The catalog `User` this contributor resolved to, or null when none matched.
   *
   * Matching is by profile e-mail and nothing else. Bots, service accounts and
   * commits authored from a personal address have no entity and stay unlinked
   * rather than being guessed at by name.
   */
  readonly entityRef: string | null;
  readonly commits: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  /** Net lines contributed: `linesAdded - linesDeleted`, floored at zero. */
  readonly linesOfCode: number;
  readonly changedFiles: number;
  readonly pullRequestsOpened: number;
  readonly pullRequestsMerged: number;
  /** Pull requests this contributor reviewed, whatever the vote. */
  readonly reviewsGiven: number;
  readonly reviewsApproved: number;
  readonly reviewsRejected: number;
  /** `reviewsApproved / reviewsGiven` as a percentage, or 0 with no reviews. */
  readonly prApprovalRate: number;
  readonly pipelineRuns: number;
  readonly pipelineRunsSucceeded: number;
  /** `pipelineRunsSucceeded / pipelineRuns` as a percentage, or 0 with no runs. */
  readonly pipelineSuccessRate: number;
  readonly repositories: number;
  readonly sonarMetrics: SonarMetrics | null;
  readonly wakaTimeMetrics: WakaTimeMetrics | null;
}

/** Percentage of `part` within `total`, rounded to one decimal, 0 when `total` is 0. */
export const computeRate = (part: number, total: number): number => {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
};
