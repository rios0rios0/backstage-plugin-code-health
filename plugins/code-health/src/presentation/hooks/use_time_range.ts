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

  const earliestDay = coverage?.earliestDay ?? null;

  const ranges = useMemo(
    () => availableRanges(earliestDay, new Date()),
    [earliestDay],
  );
  const months = useMemo(
    () => availableMonths(earliestDay, new Date()),
    [earliestDay],
  );

  const selection: RangeSelection = isOffered(requested, ranges, months)
    ? requested
    : { kind: "preset", id: ranges[ranges.length - 1]?.id ?? defaultRange };

  const key = selectionKey(selection);
  // `key` is the memo dependency and `selection` is only read through it, which
  // is exactly the intent: one window per distinct selection, not per render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const window = useMemo(() => toWindow(selection, new Date()), [key]);

  const select = useCallback((next: RangeSelection) => setRequested(next), []);

  return { ranges, months, selection, window, select };
};
