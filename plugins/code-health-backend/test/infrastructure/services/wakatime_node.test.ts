import type { WakaTimeDuration } from "../../../src/infrastructure/services/wakatime_node";
import { toAiMetrics, toBreakdown } from "../../../src/infrastructure/services/wakatime_node";

describe("toBreakdown", () => {
  it("should convert a slice list, rounding the seconds and the percentage", () => {
    // given
    const slices = [{ name: "Go", total_seconds: 3600.7, percent: 83.44 }];

    // when
    const breakdown = toBreakdown(slices);

    // then
    expect(breakdown).toEqual([{ name: "Go", totalSeconds: 3601, percent: 83.4 }]);
  });

  it("should treat an absent list as empty", () => {
    // given
    // Unlike the entity count, every one of these is genuinely empty on a day
    // somebody did not open an editor, so there is no ambiguity to preserve.
    const slices = undefined;

    // when / then
    expect(toBreakdown(slices)).toEqual([]);
  });

  it("should drop a nameless slice", () => {
    // given
    // WakaTime emits a nameless bucket for unclassified time, and a legend
    // entry reading `undefined` helps nobody.
    const slices = [{ total_seconds: 60 }, { name: "", total_seconds: 60 }];

    // when / then
    expect(toBreakdown(slices)).toEqual([]);
  });

  it("should read a missing number as zero rather than NaN", () => {
    // given
    const slices = [{ name: "Go" }];

    // when / then
    expect(toBreakdown(slices)).toEqual([{ name: "Go", totalSeconds: 0, percent: 0 }]);
  });
});

describe("toAiMetrics", () => {
  it("should sum every figure across the day's durations", () => {
    // given
    const durations: readonly WakaTimeDuration[] = [
      {
        ai_input_tokens: 1000,
        ai_output_tokens: 200,
        ai_additions: 30,
        ai_deletions: 5,
        human_additions: 70,
        human_deletions: 10,
        ai_prompt_events_total: 4,
        ai_sessions: 1,
        ai_model_costs: { "claude-opus": 0.5 },
      },
      { ai_input_tokens: 500, ai_model_costs: { "claude-opus": 0.25, "gpt-5": 1 } },
    ];

    // when
    const metrics = toAiMetrics(durations);

    // then
    expect(metrics).toEqual({
      inputTokens: 1500,
      outputTokens: 200,
      linesAddedByAi: 30,
      linesDeletedByAi: 5,
      linesAddedByHuman: 70,
      linesDeletedByHuman: 10,
      prompts: 4,
      sessions: 1,
      modelCosts: { "claude-opus": 0.75, "gpt-5": 1 },
      daysMeasured: 1,
    });
  });

  it("should return a zeroed measurement for a day with no durations", () => {
    // given
    // Reaching this function means the resource answered, and "WakaTime says no
    // AI was used today" has to stay distinguishable from "never collected",
    // which the caller stores as null instead.
    const durations: never[] = [];

    // when
    const metrics = toAiMetrics(durations);

    // then
    expect(metrics.inputTokens).toBe(0);
    expect(metrics.daysMeasured).toBe(1);
    expect(metrics.modelCosts).toEqual({});
  });

  it("should ignore a cost the provider did not report as a number", () => {
    // given
    const durations = [{ ai_model_costs: { broken: "free" } as never }];

    // when / then
    expect(toAiMetrics(durations).modelCosts).toEqual({});
  });
});
