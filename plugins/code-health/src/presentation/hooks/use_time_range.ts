import type { CoverageInfo, TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useMemo, useState } from "react";
import type {
  MonthSelection,
  RangeSelection,
  TimeRange,
  TimeRangeId,
} from "../../domain/entities/time_range";
import {
  availableMonths,
  availableRanges,
  sameMonth,
  selectionKey,
  toWindow,
} from "../../domain/entities/time_range";

export interface UseTimeRangeResult {
  /** Only the rolling ranges the backend has ingested enough history to answer. */
  readonly ranges: readonly TimeRange[];
  /** Only the calendar months with any ingested history, newest first. */
  readonly months: readonly MonthSelection[];
  readonly selection: RangeSelection;
  readonly window: TimeWindow;
  readonly select: (selection: RangeSelection) => void;
  /**
   * Re-reads the clock, producing a fresh window and refetching through it.
   *
   * This is what the refresh button and the auto-refresh timer call. Without it
   * a rolling range is frozen at the instant it was selected: "the last 24
   * hours" keeps asking for the same 24 hours however many times it is
   * refreshed, and "today" keeps meaning yesterday once the clock passes
   * midnight on a dashboard somebody left open.
   */
  readonly advance: () => void;
}

/**
 * Whether a selection is one the backend can still answer for.
 *
 * Coverage shrinks as well as grows — the retention floor moves forward every
 * day — so a month picked this morning can stop being offered, and a configured
 * default can be wider than anything ingested yet.
 */
const isOffered = (
  selection: RangeSelection,
  ranges: readonly TimeRange[],
  months: readonly MonthSelection[],
): boolean =>
  selection.kind === "preset"
    ? ranges.some((range) => range.id === selection.id)
    : months.some((month) => sameMonth(month, selection.month));

/**
 * Holds the selected range and derives the window sent to the backend.
 *
 * The window is memoised on the selection's key rather than recomputed per
 * render: it is a dependency of the fetching hooks, so a new object every render
 * would put them in a request loop.
 *
 * A selection that is no longer offered falls back to the widest rolling range
 * available, rather than querying for a period the backend would answer emptily.
 */
export const useTimeRange = (
  coverage: CoverageInfo | null,
  defaultRange: TimeRangeId,
): UseTimeRangeResult => {
  const [requested, setRequested] = useState<RangeSelection>({
    kind: "preset",
    id: defaultRange,
  });

  // The clock, sampled rather than read per render. Every derived value hangs
  // off this one state, so a refresh moves the whole picker forward together —
  // the window, the ranges that are answerable, and the months on offer.
  const [now, setNow] = useState(() => new Date());
  const advance = useCallback(() => setNow(new Date()), []);

  const earliestDay = coverage?.earliestDay ?? null;

  const ranges = useMemo(
    () => availableRanges(earliestDay, now),
    [earliestDay, now],
  );
  const months = useMemo(() => availableMonths(earliestDay, now), [earliestDay, now]);

  const selection: RangeSelection = isOffered(requested, ranges, months)
    ? requested
    : { kind: "preset", id: ranges[ranges.length - 1]?.id ?? defaultRange };

  const key = selectionKey(selection);
  // `key` stands in for `selection`, which is a fresh object on any render that
  // takes the fallback branch. One window per distinct selection per clock
  // sample is exactly the intent — recomputing per render would hand the
  // fetching hooks a new object every time and put them in a request loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const window = useMemo(() => toWindow(selection, now), [key, now]);

  const select = useCallback((next: RangeSelection) => setRequested(next), []);

  return { ranges, months, selection, window, select, advance };
};
