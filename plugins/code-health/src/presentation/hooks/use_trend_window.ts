import type {
  CoverageInfo,
  TimeSeriesBucket,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  DEFAULT_TREND_MONTHS,
  trendBucketFor,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useMemo, useState } from "react";
import { availableTrendMonths, trendWindow } from "../../domain/entities/trend_range";

export interface UseTrendWindowResult {
  /** The month count in effect, which may be narrower than the one asked for. */
  readonly months: number;
  /** The counts the backend has ingested enough history to answer for. */
  readonly offered: readonly number[];
  readonly window: TimeWindow;
  readonly bucket: TimeSeriesBucket;
  readonly select: (months: number) => void;
}

/**
 * Holds how far back a detail page looks, bounded by what has been collected.
 *
 * The clock is sampled once when the page opens rather than read per render:
 * the window is a dependency of the fetching hook, and a fresh instant every
 * render would put it in a request loop. A detail page is somewhere a person
 * goes to read one trend and leave, so it does not auto-refresh either.
 *
 * A count wider than the backfill has reached falls back to the widest one
 * offered, rather than asking for months that would come back empty and look
 * like an outage.
 */
export const useTrendWindow = (
  coverage: CoverageInfo | null,
  defaultMonths: number = DEFAULT_TREND_MONTHS,
): UseTrendWindowResult => {
  const [requested, setRequested] = useState(defaultMonths);
  const [now] = useState(() => new Date());

  const earliestDay = coverage?.earliestDay ?? null;
  const offered = useMemo(() => availableTrendMonths(earliestDay, now), [earliestDay, now]);

  const months = offered.includes(requested) ? requested : offered[offered.length - 1];
  const window = useMemo(() => trendWindow(months, now), [months, now]);
  const bucket = trendBucketFor(window.from, window.to);

  const select = useCallback((next: number) => setRequested(next), []);

  return { months, offered, window, bucket, select };
};
