import type { CoverageInfo, TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo, useState } from "react";
import type { TimeRange, TimeRangeId } from "../../domain/entities/time_range";
import { availableRanges, rangeById, toWindow } from "../../domain/entities/time_range";

export interface UseTimeRangeResult {
  readonly ranges: readonly TimeRange[];
  readonly selected: TimeRangeId;
  readonly window: TimeWindow;
  readonly select: (id: TimeRangeId) => void;
}

/**
 * Holds the selected range and derives the window sent to the backend.
 *
 * The window is memoised on the range and the coverage rather than recomputed
 * per render: it is a dependency of the fetching hooks, so a new object every
 * render would put them in a request loop.
 *
 * A selection that is no longer offered — because coverage shrank, or because
 * the configured default is wider than what has been ingested — falls back to
 * the widest range that is available, rather than querying for a period the
 * backend would answer emptily.
 */
export const useTimeRange = (
  coverage: CoverageInfo | null,
  defaultRange: TimeRangeId,
): UseTimeRangeResult => {
  const [requested, setRequested] = useState<TimeRangeId>(defaultRange);

  const ranges = useMemo(
    () => availableRanges(coverage?.earliestDay ?? null, new Date()),
    [coverage?.earliestDay],
  );

  const selected = ranges.some((range) => range.id === requested)
    ? requested
    : (ranges[ranges.length - 1]?.id ?? defaultRange);

  const window = useMemo(() => toWindow(rangeById(selected), new Date()), [selected]);

  return { ranges, selected, window, select: setRequested };
};
