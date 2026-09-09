import type { RepositoryTrendPoint } from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * One bucket of a chart: a day and one value per series.
 *
 * Declared here rather than imported from `TrendChart` so the domain layer
 * keeps pointing inward. It is structurally the chart's own `TrendPoint`,
 * which is what lets these results be handed to it without a mapper.
 */
export interface TrendPoint {
  readonly day: string;
  readonly values: Readonly<Record<string, number | null>>;
}

/**
 * A bucket's figure, or null when the bucket holds no measurement of it.
 *
 * The distinction is the whole point of these helpers. `TrendChart` breaks its
 * line across a null and draws a zero as a zero, so reading an unmeasured
 * bucket as `0` turns "Sonar had not been wired up yet" into "the coverage
 * collapsed to nothing", which is the most misleading thing a chart like this
 * can say. A count the provider genuinely reported as zero is a real
 * measurement of zero and stays a zero.
 */
type Reader = (point: RepositoryTrendPoint) => number | null;

const pointsOf = (
  points: readonly RepositoryTrendPoint[],
  readers: Readonly<Record<string, Reader>>,
): TrendPoint[] =>
  points.map((point) => ({
    day: point.day,
    values: Object.fromEntries(
      Object.entries(readers).map(([key, read]) => [key, read(point)]),
    ),
  }));

/** Series keys, so a chart and its reader can never drift apart. */
export const REPOSITORY_TREND_SERIES = {
  commits: "commits",
  pullRequestsMerged: "pullRequestsMerged",
  pullRequestsOpened: "pullRequestsOpened",
  pullRequestsAbandoned: "pullRequestsAbandoned",
  buildsSucceeded: "buildsSucceeded",
  buildsFailed: "buildsFailed",
  buildSuccessRate: "buildSuccessRate",
  reviewsPerMerge: "reviewsPerMerge",
  contributors: "contributors",
  score: "score",
  bugs: "bugs",
  vulnerabilities: "vulnerabilities",
  codeSmells: "codeSmells",
  coverage: "coverage",
  duplications: "duplications",
  technicalDebtHours: "technicalDebtHours",
  complianceChecks: "complianceChecks",
  releases: "releases",
  tags: "tags",
  codingHours: "codingHours",
  issuesResolved: "issuesResolved",
  issuesCreated: "issuesCreated",
} as const;

/** How many compliance checks a fully compliant repository passes. */
export const COMPLIANCE_CHECK_COUNT = 4;

const round = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export const commitsTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.commits]: (point) => point.summary.activity.commits,
    [REPOSITORY_TREND_SERIES.pullRequestsMerged]: (point) =>
      point.summary.activity.pullRequestsMerged,
  });

export const pullRequestTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.pullRequestsOpened]: (point) =>
      point.summary.activity.pullRequestsOpened,
    [REPOSITORY_TREND_SERIES.pullRequestsAbandoned]: (point) =>
      point.summary.activity.pullRequestsAbandoned,
  });

export const buildTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.buildsSucceeded]: (point) =>
      point.summary.activity.buildsSucceeded,
    [REPOSITORY_TREND_SERIES.buildsFailed]: (point) => point.summary.activity.buildsFailed,
  });

/**
 * The share of runs that succeeded, over the runs that reached a verdict.
 *
 * Null where nothing reached one: a bucket whose only runs were cancelled by a
 * newer push has no success rate, and drawing that as 0% would report a week of
 * superseded runs as a week of red builds.
 */
export const buildSuccessRateTrend = (
  points: readonly RepositoryTrendPoint[],
): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.buildSuccessRate]: (point) => {
      const { buildsSucceeded, buildsFailed } = point.summary.activity;
      const decided = buildsSucceeded + buildsFailed;
      return decided === 0 ? null : round((buildsSucceeded / decided) * 100, 1);
    },
  });

/**
 * Reviews per merged pull request.
 *
 * Null in a bucket where nothing merged, because the denominator is what makes
 * the figure mean anything: a quiet week with one review and no merges is not
 * infinitely well reviewed, and one with neither is not badly reviewed.
 */
export const reviewsPerMergeTrend = (
  points: readonly RepositoryTrendPoint[],
): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.reviewsPerMerge]: (point) => {
      const { reviews, pullRequestsMerged } = point.summary.activity;
      return pullRequestsMerged === 0 ? null : round(reviews / pullRequestsMerged, 2);
    },
  });

export const contributorsTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.contributors]: (point) => point.summary.activity.contributors,
  });

/**
 * The health score per bucket.
 *
 * Null where nothing in the bucket could be scored at all, which is what
 * `combineScore` reports when every component was unmeasurable.
 */
export const scoreTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.score]: (point) => point.score.value,
  });

export const defectTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.bugs]: (point) => point.summary.sonarMetrics?.bugs ?? null,
    [REPOSITORY_TREND_SERIES.vulnerabilities]: (point) =>
      point.summary.sonarMetrics?.vulnerabilities ?? null,
  });

export const codeSmellTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.codeSmells]: (point) =>
      point.summary.sonarMetrics?.codeSmells ?? null,
  });

export const coverageTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.coverage]: (point) =>
      point.summary.sonarMetrics?.coverage ?? null,
    [REPOSITORY_TREND_SERIES.duplications]: (point) =>
      point.summary.sonarMetrics?.duplications ?? null,
  });

/** Debt in hours: Sonar counts it in minutes, which reads as a phone number. */
export const technicalDebtTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.technicalDebtHours]: (point) => {
      const minutes = point.summary.sonarMetrics?.technicalDebtMinutes;
      return minutes === undefined ? null : round(minutes / 60, 1);
    },
  });

/**
 * How many of the four branch and build policy checks passed.
 *
 * Counted here rather than read off `complianceStatus.color`, because the
 * colour buckets two failures and four into the same red and a trend is asked
 * precisely to show the difference between them.
 */
export const complianceTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.complianceChecks]: (point) => {
      const compliance = point.summary.complianceStatus;
      if (compliance === null) return null;
      return [
        compliance.pipelineExists,
        compliance.buildPolicyOnPRs,
        compliance.buildPolicyExpiration,
        compliance.branchProtection,
      ].filter(Boolean).length;
    },
  });

export const releaseTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.releases]: (point) => point.summary.activity.releases,
    [REPOSITORY_TREND_SERIES.tags]: (point) => point.summary.activity.tags,
  });

/** Coding time in hours, from WakaTime's seconds. */
export const codingTimeTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.codingHours]: (point) => {
      const seconds = point.summary.wakaTimeMetrics?.totalSeconds;
      return seconds === undefined ? null : round(seconds / 3600, 1);
    },
  });

export const jiraTrend = (points: readonly RepositoryTrendPoint[]): TrendPoint[] =>
  pointsOf(points, {
    [REPOSITORY_TREND_SERIES.issuesResolved]: (point) =>
      point.summary.jiraMetrics?.issuesResolved ?? null,
    [REPOSITORY_TREND_SERIES.issuesCreated]: (point) =>
      point.summary.jiraMetrics?.issuesCreated ?? null,
  });
