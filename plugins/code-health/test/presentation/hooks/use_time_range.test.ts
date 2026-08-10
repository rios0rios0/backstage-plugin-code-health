import { act, renderHook } from "@testing-library/react";
import { useTimeRange } from "../../../src/presentation/hooks/use_time_range";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";

describe("useTimeRange", () => {
  it("should start on the configured default when it is available", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-08-10" });

    // when
    const { result } = renderHook(() => useTimeRange(coverage, "month"));

    // then
    expect(result.current.selected).toBe("month");
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
    expect(result.current.selected).toBe("day");
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
    act(() => result.current.select("quarter"));

    // then
    expect(result.current.selected).toBe("quarter");
    expect(Date.parse(result.current.window.from)).toBeLessThan(Date.parse(before));
  });

  it("should offer only the ranges the coverage reaches", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2026-07-01" });

    // when
    const { result } = renderHook(() => useTimeRange(coverage, "day"));

    // then
    expect(result.current.ranges.map((range) => range.id)).not.toContain("year");
  });

  it("should cope with coverage not having been read yet", () => {
    // given / when
    const { result } = renderHook(() => useTimeRange(null, "day"));

    // then
    expect(result.current.ranges.map((range) => range.id)).toEqual(["hour", "day"]);
  });
});
