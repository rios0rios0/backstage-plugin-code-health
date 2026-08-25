import type { TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * The rolling windows a user can pick.
 *
 * `today`, `hour` and `day` are first because they are what a freshly installed
 * plugin can answer for: the background actor collects the recent window before
 * it starts walking backwards, so the dashboard is useful within a tick and the
 * wider options unlock as the backfill advances.
 */
export type TimeRangeId = "today" | "hour" | "day" | "week" | "month" | "quarter" | "year";

export interface TimeRange {
  readonly id: TimeRangeId;
  readonly label: string;
  /**
   * How far back the range reaches, in days. Used to decide whether the backend
   * has ingested enough history to offer it.
   */
  readonly days: number;
  /**
   * Anchors the window to the start of the local calendar day rather than to a
   * fixed number of hours back.
   *
   * "Today" and "the last 24 hours" are different questions, and at nine in the
   * morning they give very different answers. Both are offered because both get
   * asked — "what has happened today" for a standup, "the last day" for a trend.
   */
  readonly calendar?: boolean;
}

export const TIME_RANGES: readonly TimeRange[] = [
  { id: "today", label: "Today", days: 1, calendar: true },
  { id: "hour", label: "Last hour", days: 1 / 24 },
  { id: "day", label: "Last 24 hours", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "quarter", label: "Last 90 days", days: 90 },
  { id: "year", label: "Last 365 days", days: 365 },
];

export const DEFAULT_RANGE_ID: TimeRangeId = "day";

export const rangeById = (id: TimeRangeId): TimeRange =>
  TIME_RANGES.find((range) => range.id === id) ?? TIME_RANGES[2];

/** One calendar month, `month` being 1-12 rather than the 0-11 `Date` uses. */
export interface MonthSelection {
  readonly year: number;
  readonly month: number;
}

/**
 * What the toolbar is currently asking for.
 *
 * A rolling range and a calendar month are not two values of one enum: a month
 * carries a year with it, and squeezing that into a string id would mean parsing
 * it back out everywhere it is read.
 */
export type RangeSelection =
  | { readonly kind: "preset"; readonly id: TimeRangeId }
  | { readonly kind: "month"; readonly month: MonthSelection };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A stable key for a selection, so the window can be memoised on a primitive.
 *
 * The window object is a dependency of every fetching hook, so a new one per
 * render would put them in a request loop.
 */
export const selectionKey = (selection: RangeSelection): string =>
  selection.kind === "preset"
    ? `preset:${selection.id}`
    : `month:${selection.month.year}-${selection.month.month}`;

export const monthOf = (instant: Date): MonthSelection => ({
  year: instant.getFullYear(),
  month: instant.getMonth() + 1,
});

export const sameMonth = (left: MonthSelection, right: MonthSelection): boolean =>
  left.year === right.year && left.month === right.month;

/** The month `offset` months away, rolling the year over as needed. */
export const shiftMonth = (month: MonthSelection, offset: number): MonthSelection => {
  const shifted = new Date(month.year, month.month - 1 + offset, 1);
  return monthOf(shifted);
};

const MONTH_NAMES: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const monthName = (month: number): string => MONTH_NAMES[month - 1] ?? "";

export const monthLabel = (month: MonthSelection): string =>
  `${monthName(month.month)} ${month.year}`;

/**
 * The window a selection asks the backend for.
 *
 * Calendar boundaries are the viewer's local ones, not UTC. "March" means the
 * March the person reading the dashboard lived through, and the backend takes
 * exact instants either way, so nothing is lost by resolving it here.
 *
 * A month that has not finished is cut off at `now` rather than run to its last
 * day: asking for a window that ends in the future would make every chart end in
 * a flat stretch of days nothing could have happened in yet.
 */
export const toWindow = (selection: RangeSelection, now: Date): TimeWindow => {
  if (selection.kind === "month") {
    const { year, month } = selection.month;
    const start = new Date(year, month - 1, 1);
    const nextMonth = new Date(year, month, 1);
    const end = nextMonth.getTime() > now.getTime() ? now : nextMonth;
    return { from: start.toISOString(), to: end.toISOString() };
  }

  const range = rangeById(selection.id);
  const from = range.calendar
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getTime() - range.days * MS_PER_DAY);

  return { from: from.toISOString(), to: now.toISOString() };
};

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
  // The ranges inside a day are always offered: the incremental phase keeps them
  // fresh even before a single whole day has been recorded as covered.
  const always = TIME_RANGES.filter((range) => range.days <= 1);
  if (!earliestDay) return always;

  const earliest = new Date(`${earliestDay}T00:00:00.000Z`).getTime();
  const covered = TIME_RANGES.filter(
    (range) => now.getTime() - range.days * MS_PER_DAY >= earliest,
  );

  return covered.length > always.length ? covered : always;
};

/** Months with any ingested history, newest first, ending at the current one. */
export const availableMonths = (
  earliestDay: string | null,
  now: Date,
): readonly MonthSelection[] => {
  const current = monthOf(now);
  if (!earliestDay) return [current];

  const parsed = new Date(`${earliestDay}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return [current];

  // Read in UTC because that is the calendar the backend records days in, then
  // treated as a local month from here on. A day either side at the boundary is
  // the price of not offering a month the backfill has not reached at all.
  const earliest: MonthSelection = {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
  };

  const months: MonthSelection[] = [];
  for (let cursor = current; ; cursor = shiftMonth(cursor, -1)) {
    months.push(cursor);
    if (sameMonth(cursor, earliest)) break;
    // A bad `earliestDay` in the future would otherwise loop forever.
    if (cursor.year < earliest.year) break;
    if (months.length > 600) break;
  }

  return months;
};

/** Every year the month picker can offer, newest first. */
export const availableYears = (months: readonly MonthSelection[]): readonly number[] => [
  ...new Set(months.map((month) => month.year)),
];

export const monthsInYear = (
  months: readonly MonthSelection[],
  year: number,
): readonly MonthSelection[] => months.filter((month) => month.year === year);
