import type { TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * The windows a user can pick.
 *
 * `hour` and `day` are first because they are what a freshly installed plugin
 * can answer for: the background actor collects the recent window before it
 * starts walking backwards, so the dashboard is useful within a tick and the
 * wider options unlock as the backfill advances.
 */
export type TimeRangeId = "hour" | "day" | "week" | "month" | "quarter" | "year";

export interface TimeRange {
  readonly id: TimeRangeId;
  readonly label: string;
  readonly days: number;
}

export const TIME_RANGES: readonly TimeRange[] = [
  { id: "hour", label: "Last hour", days: 1 / 24 },
  { id: "day", label: "Last 24 hours", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "quarter", label: "Last 90 days", days: 90 },
  { id: "year", label: "Last 365 days", days: 365 },
];

export const DEFAULT_RANGE_ID: TimeRangeId = "day";

export const rangeById = (id: TimeRangeId): TimeRange =>
  TIME_RANGES.find((range) => range.id === id) ?? TIME_RANGES[1];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const toWindow = (range: TimeRange, now: Date): TimeWindow => ({
  from: new Date(now.getTime() - range.days * MS_PER_DAY).toISOString(),
  to: now.toISOString(),
});

/**
 * The ranges the backend can actually answer for.
 *
 * Offering a year when only a week has been ingested would render an empty
 * chart that looks like an outage rather than like a backfill still running.
 * A range is available once its start is at or after the earliest day covered.
 */
export const availableRanges = (
  earliestDay: string | null,
  now: Date,
): readonly TimeRange[] => {
  if (!earliestDay) return TIME_RANGES.slice(0, 2);

  const earliest = new Date(`${earliestDay}T00:00:00.000Z`).getTime();
  const covered = TIME_RANGES.filter((range) => now.getTime() - range.days * MS_PER_DAY >= earliest);

  // The two shortest ranges are always offered: the incremental phase keeps
  // them fresh even before a single whole day has been recorded as covered.
  return covered.length > 2 ? covered : TIME_RANGES.slice(0, 2);
};
