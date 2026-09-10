import type { ContributorSummary } from "./contributor_summary";
import type { ProductivityScore } from "./productivity_score";
import type { RepositoryHealthScore } from "./repository_health_score";
import type { RepositorySummary } from "./repository_summary";
import type { TimeSeriesBucket } from "./time_series";

/**
 * One bucket of a person's history: the same row the contributors table shows,
 * aggregated over the bucket alone, and the score it earns against the fleet
 * in that same bucket. `day` is the first day of the bucket, as `YYYY-MM-DD`.
 *
 * Carrying the whole summary rather than a hand-picked subset is deliberate:
 * a chart of any column the table has is then a chart of the same number,
 * computed by the same code, and a new column never needs a second wire type.
 */
export interface ContributorTrendPoint {
  readonly day: string;
  readonly summary: ContributorSummary;
  readonly score: ProductivityScore;
}

/**
 * One bucket of a repository's history. `activity` is the bucket's events;
 * everything else comes from the most recent daily snapshot at or before the
 * bucket's last day, so Sonar and compliance series move at the resolution
 * the snapshot task records and start at the first snapshot after installation.
 */
export interface RepositoryTrendPoint {
  readonly day: string;
  readonly summary: RepositorySummary;
  readonly score: RepositoryHealthScore;
}

/** The month counts a detail page offers, so the two pages never disagree. */
export const TREND_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6];

export const DEFAULT_TREND_MONTHS = 3;

/**
 * Windows up to this many days are bucketed by day; longer ones by week.
 *
 * A daily bucket over six months is a hundred and eighty points across a
 * card, which reads as noise; a weekly bucket over one month is four points,
 * which reads as nothing. Deriving it from the window removes a knob whose
 * only correct setting is implied by the months already picked.
 */
export const TREND_DAILY_LIMIT_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

export const trendBucketFor = (from: string, to: string): TimeSeriesBucket => {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS;
  return days > TREND_DAILY_LIMIT_DAYS ? "week" : "day";
};
