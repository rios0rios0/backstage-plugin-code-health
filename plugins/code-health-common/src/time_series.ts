import type { RepositoryActivity } from "./repository_summary";

export type TimeSeriesBucket = "day" | "week" | "month";

export const TIME_SERIES_BUCKETS: readonly TimeSeriesBucket[] = ["day", "week", "month"];

export const isTimeSeriesBucket = (value: string): value is TimeSeriesBucket =>
  (TIME_SERIES_BUCKETS as readonly string[]).includes(value);

/**
 * Activity for one bucket of a repository's history. `day` is the first day of
 * the bucket, as `YYYY-MM-DD`.
 */
export interface TimeSeriesPoint {
  readonly day: string;
  readonly activity: RepositoryActivity;
}
