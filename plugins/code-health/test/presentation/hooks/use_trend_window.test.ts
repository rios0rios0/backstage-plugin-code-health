import { act, renderHook } from "@testing-library/react";
import { useTrendWindow } from "../../../src/presentation/hooks/use_trend_window";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";

const DAY_MS = 24 * 60 * 60 * 1000;

const daysSpanned = (window: { from: string; to: string }): number =>
  Math.round((new Date(window.to).getTime() - new Date(window.from).getTime()) / DAY_MS);

describe("useTrendWindow", () => {
  it("should start at the default count with a full year of history", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-01-01" });

    // when
    const { result } = renderHook(() => useTrendWindow(coverage));

    // then
    expect(result.current.months).toBe(3);
    expect(result.current.offered).toEqual([1, 2, 3, 4, 5, 6]);
    expect(daysSpanned(result.current.window)).toBeGreaterThanOrEqual(89);
    expect(result.current.bucket).toBe("week");
  });

  it("should bucket a single month by day", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-01-01" });
    const { result } = renderHook(() => useTrendWindow(coverage, 1));

    // when
    const { bucket, months } = result.current;

    // then
    expect(months).toBe(1);
    expect(bucket).toBe("day");
  });

  it("should move the window when another count is selected", () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2025-01-01" });
    const { result } = renderHook(() => useTrendWindow(coverage));
    const before = result.current.window;

    // when
    act(() => result.current.select(6));

    // then
    expect(result.current.months).toBe(6);
    expect(daysSpanned(result.current.window)).toBeGreaterThan(daysSpanned(before));
    // The end does not move: the clock was sampled once, when the page opened.
    expect(result.current.window.to).toBe(before.to);
  });

  it("should fall back to the widest count offered when the requested one is not covered", () => {
    // given
    const recent = new Date();
    recent.setDate(recent.getDate() - 40);
    const coverage = aCoverageInfo({ earliestDay: recent.toISOString().slice(0, 10) });

    // when
    const { result } = renderHook(() => useTrendWindow(coverage, 6));

    // then
    // Forty days of history covers one month, not six.
    expect(result.current.offered).toEqual([1]);
    expect(result.current.months).toBe(1);
  });

  it("should offer the shortest count before coverage is known", () => {
    // given / when
    const { result } = renderHook(() => useTrendWindow(null));

    // then
    expect(result.current.offered).toEqual([1]);
    expect(result.current.months).toBe(1);
  });
});
