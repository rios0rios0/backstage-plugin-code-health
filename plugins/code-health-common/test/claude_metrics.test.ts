import { claudeRatesOf, claudeTokenTotal, claudeWindowDays, mergeClaudeMetrics } from "../src/claude_metrics";

const counts = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 60, cacheCreationTokens: 10 };
const metrics = { ...counts, daily: [{ day: "2026-09-01", ...counts }] };

describe("Claude usage arithmetic", () => {
  it("should include cache tokens and combine linked accounts on the same UTC day", () => {
    // given
    const parts = [metrics, metrics];
    // when
    const merged = mergeClaudeMetrics(parts)!;
    // then
    expect(claudeTokenTotal(merged)).toBe(380);
    expect(merged.daily).toHaveLength(1);
    expect(claudeTokenTotal(merged.daily[0])).toBe(380);
    expect(mergeClaudeMetrics([])).toBeNull();
  });

  it("should average over elapsed UTC dates rather than active days", () => {
    // given
    const window = { from: "2026-09-01T00:00:00Z", to: "2026-09-08T00:00:00Z" };
    // when
    const days = claudeWindowDays(window);
    const rates = claudeRatesOf(metrics, days);
    // then
    expect(days).toBe(7);
    expect(rates.daily).toBeCloseTo(27.142857);
    expect(rates.weekly).toBe(190);
    expect(rates.monthly).toBeCloseTo(826.160714);
  });

  it.each([
    ["2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", 1],
    ["2026-09-01T10:00:00Z", "2026-09-02T11:00:00Z", 2],
    ["2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z", 30],
    ["bad", "also bad", 1],
    ["2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z", 1],
  ])("should count daily reports for %s to %s", (from, to, expected) => {
    // given
    const window = { from, to };
    // when
    const days = claudeWindowDays(window);
    // then
    expect(days).toBe(expected);
  });
});
