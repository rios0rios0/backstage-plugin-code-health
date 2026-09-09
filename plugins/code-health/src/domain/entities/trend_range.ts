import type { TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";
import { TREND_MONTHS } from "@rios0rios0/backstage-plugin-code-health-common";

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

/**
 * The instant `months` calendar months before `now`, on the same day of the
 * month where it exists.
 *
 * Calendar months rather than thirty-day blocks, because "the last three
 * months" means March to June to the person reading it. The day is clamped
 * rather than rolled over: three months before the thirty-first of May is the
 * twenty-eighth of February, not the third of March.
 */
export const monthsBefore = (now: Date, months: number): Date => {
  const year = now.getFullYear();
  const month = now.getMonth() - months;
  const day = Math.min(now.getDate(), daysInMonth(year, month));
  return new Date(
    year,
    month,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );
};

/** The window a detail page asks for: the last `months` months, ending now. */
export const trendWindow = (months: number, now: Date): TimeWindow => ({
  from: monthsBefore(now, months).toISOString(),
  to: now.toISOString(),
});

/**
 * The month counts the backend can actually answer for.
 *
 * A count is offered once its window starts at or after the earliest day any
 * repository has data for, on the same rule the range picker applies. The
 * shortest count is always offered, even before a whole month has been
 * collected: a fresh install then shows the weeks it has rather than nothing,
 * and the page says the rest is still being collected.
 */
export const availableTrendMonths = (
  earliestDay: string | null,
  now: Date,
): readonly number[] => {
  const shortest = TREND_MONTHS.slice(0, 1);
  if (!earliestDay) return shortest;

  const earliest = new Date(`${earliestDay}T00:00:00.000Z`).getTime();
  if (Number.isNaN(earliest)) return shortest;

  const covered = TREND_MONTHS.filter(
    (months) => monthsBefore(now, months).getTime() >= earliest,
  );
  return covered.length > 0 ? covered : shortest;
};
