import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import type { TimeRangeId } from "../../../src/domain/entities/time_range";
import { RangeSelectionProvider } from "../../../src/presentation/hooks/range_selection_context";
import { useTimeRange } from "../../../src/presentation/hooks/use_time_range";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";

/** Narrows a selection to a preset id, failing loudly when it is a month. */
const presetOf = (selection: { kind: string; id?: string }): string | undefined =>
  selection.kind === "preset" ? selection.id : undefined;

/**
 * The provider the plugin's router puts above the tabs.
 *
 * Built with `createElement` rather than JSX so this file stays a `.ts` beside
 * every other hook test.
 */
const withProvider =
  (defaultRange: TimeRangeId = "day") =>
  ({ children }: { children: ReactNode }) =>
    createElement(RangeSelectionProvider, { defaultRange, children });

describe("useTimeRange", () => {
  it("should start on the configured default when it is available", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });

    // when
    const { result } = renderHook(() => useTimeRange(coverage, "month"));

    // then
    expect(presetOf(result.current.selection)).toBe("month");
    expect(result.current.window.from).toBeDefined();
  });

  it("should fall back to the widest range the backend can answer for", () => {
    // given
    // A default wider than what has been ingested would query for a period the
    // backend can only answer emptily, which reads as a broken dashboard.
    const coverage = aCoverageInfo({ earliestDay: null });

    // when
    const { result } = renderHook(() => useTimeRange(coverage, "year"));

    // then
    expect(presetOf(result.current.selection)).toBe("day");
  });

  it("should keep the window stable across renders", () => {
    // given
    // The window is a dependency of the fetching hooks, so a new object every
    // render would put them in a request loop.
    const coverage = aCoverageInfo();
    const { result, rerender } = renderHook(() => useTimeRange(coverage, "day"));
    const first = result.current.window;

    // when
    rerender();

    // then
    expect(result.current.window).toBe(first);
  });

  it("should widen the window when a longer range is selected", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });
    const { result } = renderHook(() => useTimeRange(coverage, "day"));
    const before = result.current.window.from;

    // when
    act(() => result.current.select({ kind: "preset", id: "quarter" }));

    // then
    expect(presetOf(result.current.selection)).toBe("quarter");
    expect(Date.parse(result.current.window.from)).toBeLessThan(Date.parse(before));
  });

  it("should move the window onto a selected calendar month", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });
    const { result } = renderHook(() => useTimeRange(coverage, "day"));
    const month = result.current.months[1];

    // when
    act(() => result.current.select({ kind: "month", month }));

    // then
    expect(result.current.selection).toEqual({ kind: "month", month });
    expect(new Date(result.current.window.from).getMonth()).toBe(month.month - 1);
  });

  it("should drop a month the coverage no longer reaches", () => {
    // given
    // The retention floor moves forward every day, so a month selected this
    // morning can stop being answerable.
    const coverage = aCoverageInfo({ earliestDay: "2026-08-01" });
    const { result } = renderHook(() => useTimeRange(coverage, "day"));

    // when
    act(() => result.current.select({ kind: "month", month: { year: 2019, month: 4 } }));

    // then
    expect(result.current.selection.kind).toBe("preset");
  });

  it("should offer only the ranges the coverage reaches", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2026-07-01" });

    // when
    const { result } = renderHook(() => useTimeRange(coverage, "day"));

    // then
    expect(result.current.ranges.map((range) => range.id)).not.toContain("year");
  });

  it("should move the window forward when the clock is re-read", () => {
    // given
    // A rolling range frozen at the instant it was selected keeps asking for
    // the same period however many times it is refreshed, so the numbers never
    // move even though the button says they did.
    jest.useFakeTimers().setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    const { result } = renderHook(() => useTimeRange(aCoverageInfo(), "day"));
    const before = result.current.window;

    // when
    jest.setSystemTime(new Date("2026-08-10T12:30:00.000Z"));
    act(() => result.current.advance());

    // then
    expect(Date.parse(result.current.window.to)).toBeGreaterThan(Date.parse(before.to));
    expect(Date.parse(result.current.window.from)).toBeGreaterThan(Date.parse(before.from));
    jest.useRealTimers();
  });

  it("should re-anchor `today` after the clock passes midnight", () => {
    // given
    // A dashboard left open overnight would otherwise keep reporting yesterday
    // as today.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10, 23, 50));
    const { result } = renderHook(() => useTimeRange(aCoverageInfo(), "today"));
    const before = result.current.window;

    // when
    jest.setSystemTime(new Date(2026, 7, 11, 0, 10));
    act(() => result.current.advance());

    // then
    expect(new Date(before.from).getDate()).toBe(10);
    expect(new Date(result.current.window.from).getDate()).toBe(11);
    jest.useRealTimers();
  });

  it("should offer a month the clock has only just entered", () => {
    // given
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 31, 23, 50));
    const { result } = renderHook(() =>
      useTimeRange(aCoverageInfo({ earliestDay: "2026-07-01" }), "day"),
    );
    expect(result.current.months[0]).toEqual({ year: 2026, month: 8 });

    // when
    jest.setSystemTime(new Date(2026, 8, 1, 0, 10));
    act(() => result.current.advance());

    // then
    expect(result.current.months[0]).toEqual({ year: 2026, month: 9 });
    jest.useRealTimers();
  });

  it("should share one selection with every other hook under the provider", () => {
    // given
    // Every tab holds its own instance of this hook, so a month picked on one
    // used to be gone the moment somebody clicked another.
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });
    const { result } = renderHook(
      () => ({
        insights: useTimeRange(coverage, "day"),
        contributors: useTimeRange(coverage, "day"),
      }),
      { wrapper: withProvider() },
    );
    const month = result.current.insights.months[1];

    // when
    act(() => result.current.insights.select({ kind: "month", month }));

    // then
    expect(result.current.contributors.selection).toEqual({ kind: "month", month });
  });

  it("should start on the range the provider was seeded with", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });

    // when
    // The router seeds the provider from `codeHealth.defaultRange`, so the
    // shared selection is where the default lands once one is in place.
    const { result } = renderHook(() => useTimeRange(coverage, "day"), {
      wrapper: withProvider("quarter"),
    });

    // then
    expect(presetOf(result.current.selection)).toBe("quarter");
  });

  it("should remember a pick across a rerender with no provider at all", () => {
    // given
    // A page rendered on its own — in a test, or embedded by a host — keeps its
    // own selection rather than losing it on the next render.
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });
    const { result, rerender } = renderHook(() => useTimeRange(coverage, "day"));
    act(() => result.current.select({ kind: "preset", id: "week" }));

    // when
    rerender();

    // then
    expect(presetOf(result.current.selection)).toBe("week");
  });

  it("should keep two hooks apart when nothing shares a selection", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });
    const { result } = renderHook(() => ({
      first: useTimeRange(coverage, "day"),
      second: useTimeRange(coverage, "day"),
    }));

    // when
    act(() => result.current.first.select({ kind: "preset", id: "week" }));

    // then
    // The fallback is per hook, not a module-level singleton hiding behind one.
    expect(presetOf(result.current.second.selection)).toBe("day");
  });

  it("should cope with coverage not having been read yet", () => {
    // given / when
    const { result } = renderHook(() => useTimeRange(null, "day"));

    // then
    expect(result.current.ranges.map((range) => range.id)).toEqual([
      "today",
      "hour",
      "day",
    ]);
    expect(result.current.months).toHaveLength(1);
  });
});
