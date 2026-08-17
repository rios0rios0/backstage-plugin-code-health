import type {
  ContributorSummary,
  RepositorySummary,
  TimeSeriesPoint,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { computeRate } from "@rios0rios0/backstage-plugin-code-health-common";

/** One bar of a ranking chart. */
export interface RankedItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** Secondary figure shown beside the value, already formatted. */
  readonly detail: string;
  /** Catalog entity to link the label to, when the row resolved to one. */
  readonly entityRef: string | null;
  readonly avatarUrl: string | null;
}

/** One slice of a status breakdown. */
export interface StatusSlice {
  readonly label: string;
  readonly count: number;
  readonly tone: StatusTone;
}

export type StatusTone = "good" | "warning" | "critical" | "unknown";

/** One point of the cadence chart, flattened out of the backend's buckets. */
export interface CadencePoint {
  readonly day: string;
  readonly commits: number;
  readonly pullRequestsMerged: number;
}

/** The headline figures above the charts. */
export interface FleetKpis {
  readonly activeRepositories: number;
  readonly trackedRepositories: number;
  readonly activeContributors: number;
  readonly commits: number;
  readonly pullRequestsMerged: number;
  /** Percentage of pipeline runs that succeeded, or null with no runs. */
  readonly buildSuccessRate: number | null;
  /** Percentage of merged pull requests that carry at least one review. */
  readonly reviewCoverage: number | null;
}

const RANK_SIZE = 5;

const byValueDescending = (left: RankedItem, right: RankedItem): number =>
  right.value - left.value || left.label.localeCompare(right.label);

/**
 * The top {@link RANK_SIZE} rows, dropping anything with nothing to show.
 *
 * Zero-valued rows are filtered rather than padded out: a chart claiming a "top
 * 5" when only two people committed reads as five contributors, three of whom
 * did nothing.
 */
const topOf = (items: readonly RankedItem[]): RankedItem[] =>
  [...items].filter((item) => item.value > 0).sort(byValueDescending).slice(0, RANK_SIZE);

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const topContributorsByCommits = (
  contributors: readonly ContributorSummary[],
): RankedItem[] =>
  topOf(
    contributors.map((contributor) => ({
      id: contributor.key,
      label: contributor.displayName,
      value: contributor.commits,
      detail: plural(contributor.repositories, "repo"),
      entityRef: contributor.entityRef,
      avatarUrl: contributor.avatarUrl,
    })),
  );

/**
 * Who is reviewing, which is not the same question as who is committing.
 *
 * Review load concentrating on one or two people is the readable form of a bus
 * factor problem, and it is invisible on a commit ranking.
 */
export const topReviewers = (contributors: readonly ContributorSummary[]): RankedItem[] =>
  topOf(
    contributors.map((contributor) => ({
      id: contributor.key,
      label: contributor.displayName,
      value: contributor.reviewsGiven,
      detail: `${contributor.prApprovalRate}% approved`,
      entityRef: contributor.entityRef,
      avatarUrl: contributor.avatarUrl,
    })),
  );

export const topRepositoriesByCommits = (
  repositories: readonly RepositorySummary[],
): RankedItem[] =>
  topOf(
    repositories.map((repository) => ({
      id: repository.id,
      label: repository.name,
      value: repository.activity.commits,
      detail: plural(repository.activity.contributors, "contributor"),
      entityRef: repository.entityRef,
      avatarUrl: null,
    })),
  );

/**
 * Where the fleet stands on its quality gates.
 *
 * Repositories with no Sonar project are counted separately rather than folded
 * into the failures — "not measured" and "measured and failing" call for
 * different actions, and merging them overstates the problem.
 */
export const qualityGateBreakdown = (
  repositories: readonly RepositorySummary[],
): StatusSlice[] => {
  const passing = repositories.filter(
    (repository) => repository.sonarMetrics?.qualityGateStatus === "OK",
  ).length;
  const failing = repositories.filter(
    (repository) => repository.sonarMetrics?.qualityGateStatus === "ERROR",
  ).length;

  return [
    { label: "Passing", count: passing, tone: "good" },
    { label: "Failing", count: failing, tone: "critical" },
    {
      label: "Not measured",
      count: repositories.length - passing - failing,
      tone: "unknown",
    },
  ];
};

/** How much of the fleet meets the branch-protection and build-policy checks. */
export const complianceBreakdown = (
  repositories: readonly RepositorySummary[],
): StatusSlice[] => {
  const count = (color: string) =>
    repositories.filter((repository) => repository.complianceStatus?.color === color).length;

  const compliant = count("green");
  const partial = count("yellow");
  const failing = count("red");

  return [
    { label: "Compliant", count: compliant, tone: "good" },
    { label: "One check missing", count: partial, tone: "warning" },
    { label: "Two or more missing", count: failing, tone: "critical" },
    {
      label: "Not measured",
      count: repositories.length - compliant - partial - failing,
      tone: "unknown",
    },
  ];
};

export const toCadence = (points: readonly TimeSeriesPoint[]): CadencePoint[] =>
  points.map((point) => ({
    day: point.day,
    commits: point.activity.commits,
    pullRequestsMerged: point.activity.pullRequestsMerged,
  }));

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * The headline figures.
 *
 * Contributor counts come from the contributors list rather than by adding up
 * `activity.contributors` per repository, which double-counts anyone who worked
 * in more than one.
 */
export const computeKpis = (
  repositories: readonly RepositorySummary[],
  contributors: readonly ContributorSummary[],
): FleetKpis => {
  const builds = sum(repositories.map((repository) => repository.activity.builds));
  const succeeded = sum(
    repositories.map((repository) => repository.activity.buildsSucceeded),
  );
  const merged = sum(
    repositories.map((repository) => repository.activity.pullRequestsMerged),
  );
  const reviews = sum(contributors.map((contributor) => contributor.reviewsGiven));

  return {
    activeRepositories: repositories.filter(
      (repository) => repository.activity.commits > 0,
    ).length,
    trackedRepositories: repositories.length,
    activeContributors: contributors.filter((contributor) => contributor.commits > 0)
      .length,
    commits: sum(repositories.map((repository) => repository.activity.commits)),
    pullRequestsMerged: merged,
    buildSuccessRate: builds > 0 ? computeRate(succeeded, builds) : null,
    // Capped at 100: a pull request can collect more than one review, and a
    // "coverage" figure above 100% is a unit error on its face.
    reviewCoverage: merged > 0 ? Math.min(100, computeRate(reviews, merged)) : null,
  };
};
