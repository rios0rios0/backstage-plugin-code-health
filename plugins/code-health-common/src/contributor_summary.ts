import type { ConfluenceContributorMetrics } from "./confluence_metrics";
import type { ContributorIdentity } from "./identity";
import type { JiraContributorMetrics } from "./jira_metrics";
import type { SonarMetrics } from "./sonar_metrics";
import type { WakaTimeMetrics } from "./wakatime_metrics";

/**
 * One row of the contributors dashboard, aggregated from the events inside the
 * requested window.
 *
 * A row is a *person*, not an account. `key` is the catalog `User` entity the
 * row's accounts resolved to, and falls back to `<source>:<sourceKey>` for an
 * account nobody has linked yet — so an unlinked identity still gets a row
 * rather than disappearing.
 *
 * This is the change that makes the row worth reading at all once more than one
 * system is being measured. A person's commits arrive under a GitHub login,
 * their coding time under a WakaTime username, their tickets under an Atlassian
 * `accountId`, and none of the three matches the others. Keyed by account, the
 * same human occupied three rows that each held a third of the story; keyed by
 * person, the row adds up. {@link identities} names what was merged, because a
 * total nobody can trace back to its sources is a number nobody trusts.
 */
/**
 * Which unit a contributor's churn is actually measured in.
 *
 * The two providers do not report the same thing and cannot be made to. GitHub's
 * commit history carries added and deleted *lines*; Azure DevOps carries added,
 * edited and deleted *files* and exposes no line count anywhere in its REST API
 * — reconstructing one would mean diffing every blob of every commit.
 *
 * Carrying the unit explicitly is what lets a view render the figure it has
 * instead of rendering a zero. The alternative, inferring the unit from which
 * number is non-zero, misreads a real quiet week as a missing measurement.
 */
export type ChurnUnit = "lines" | "files" | "none";

export interface ContributorSummary {
  readonly key: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly profileUrl: string | null;
  /**
   * The catalog `User` this person resolved to, or null when no account on the
   * row is linked to one.
   *
   * A link is made two ways. An account whose e-mail matches a `User` profile
   * is linked on sight, because that is the same rule the catalog itself uses
   * to decide who somebody is. Everything else — a WakaTime username, an
   * Atlassian `accountId`, a commit from a personal address — is *offered* as a
   * ranked suggestion on the Identities screen and linked only when a person
   * confirms it. Nothing is merged on a name resemblance alone: two people who
   * share a surname would silently become one contributor, and a merge nobody
   * asked for is far harder to notice than a row that stayed separate.
   */
  readonly entityRef: string | null;
  /**
   * Every account that was merged into this row, in the order they were
   * observed. A single-account row carries one entry, never zero.
   */
  readonly identities: readonly ContributorIdentity[];
  readonly commits: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  /** Net lines contributed: `linesAdded - linesDeleted`, floored at zero. */
  readonly linesOfCode: number;
  readonly changedFiles: number;
  /**
   * What `linesOfCode` and `changedFiles` mean for this contributor: `lines`
   * when the provider reported line counts, `files` when it only reported file
   * counts, `none` when it reported neither.
   */
  readonly churnUnit: ChurnUnit;
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
  readonly jiraMetrics: JiraContributorMetrics | null;
  readonly confluenceMetrics: ConfluenceContributorMetrics | null;
}

/** Percentage of `part` within `total`, rounded to one decimal, 0 when `total` is 0. */
export const computeRate = (part: number, total: number): number => {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
};
