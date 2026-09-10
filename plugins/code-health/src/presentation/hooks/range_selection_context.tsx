import type { ReactNode } from "react";
import { createContext, useMemo, useState } from "react";
import type { RangeSelection, TimeRangeId } from "../../domain/entities/time_range";

interface RangeSelectionContextValue {
  /**
   * What was asked for, which is not always what is on screen: coverage decides
   * whether a request is answerable, and that is each tab's own reading of it.
   */
  readonly requested: RangeSelection;
  readonly request: (selection: RangeSelection) => void;
}

/**
 * Absent until something provides it.
 *
 * `null` rather than a ready-made default, so `useTimeRange` can tell "nobody is
 * sharing a selection" from "somebody is sharing the default one". A default
 * here would hand a page rendered on its own a selection it could read and
 * never write, which is the silent half of the bug this context exists to fix.
 */
export const RangeSelectionContext = createContext<RangeSelectionContextValue | null>(
  null,
);

interface RangeSelectionProviderProps {
  /** Where the selection starts, from `codeHealth.defaultRange`. */
  readonly defaultRange: TimeRangeId;
  readonly children: ReactNode;
}

/**
 * One range selection for every tab underneath.
 *
 * Each tab used to hold its own, so a month picked on Insights was gone the
 * moment somebody clicked Contributors and the dashboard read as though it kept
 * resetting itself to the default nobody had chosen.
 *
 * Only the *request* is shared. Which window it resolves to stays each tab's
 * own business, because each samples its own clock, and a tab opened after
 * midnight should not inherit the previous one's idea of "today".
 */
export const RangeSelectionProvider = ({
  defaultRange,
  children,
}: RangeSelectionProviderProps) => {
  const [requested, setRequested] = useState<RangeSelection>(() => ({
    kind: "preset",
    id: defaultRange,
  }));

  // `setRequested` is stable, so the callback a consumer holds survives every
  // change to the value around it — which is what keeps `select` stable in
  // `useTimeRange` and out of the fetching hooks' dependencies.
  const value = useMemo(() => ({ requested, request: setRequested }), [requested]);

  return (
    <RangeSelectionContext.Provider value={value}>
      {children}
    </RangeSelectionContext.Provider>
  );
};
