import type {
  WakaTimeAiMetrics,
  WakaTimeBreakdownItem,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * The parts of WakaTime's responses this plugin reads.
 *
 * Every field is optional. WakaTime returns a different subset per plan — the
 * entity list, the branch list and the whole AI block are all absent on some —
 * and a required field would turn a plan difference into a parse error on a
 * response that is otherwise perfectly good.
 */
interface WakaTimeUser {
  readonly id?: string | null;
  readonly username?: string | null;
  readonly display_name?: string | null;
  readonly email?: string | null;
  readonly photo?: string | null;
}

export interface WakaTimeUserResponse {
  readonly data?: WakaTimeUser;
}

export interface WakaTimeDashboardsResponse {
  readonly data?: readonly { readonly id?: string; readonly name?: string }[];
}

export interface WakaTimeMembersResponse {
  readonly data?: readonly {
    readonly id?: string | null;
    readonly user?: WakaTimeUser;
  }[];
}

interface WakaTimeSlice {
  readonly name?: string;
  readonly total_seconds?: number;
  readonly percent?: number;
}

export interface WakaTimeSummaryDay {
  readonly grand_total?: { readonly total_seconds?: number };
  readonly range?: { readonly date?: string };
  readonly projects?: readonly WakaTimeSlice[];
  readonly languages?: readonly WakaTimeSlice[];
  readonly editors?: readonly WakaTimeSlice[];
  readonly operating_systems?: readonly WakaTimeSlice[];
  readonly machines?: readonly WakaTimeSlice[];
  readonly categories?: readonly WakaTimeSlice[];
  readonly branches?: readonly WakaTimeSlice[];
  readonly entities?: readonly WakaTimeSlice[];
}

export interface WakaTimeSummariesResponse {
  readonly data?: readonly WakaTimeSummaryDay[];
}

/**
 * One joined run of heartbeats.
 *
 * The AI fields are the only place any system in this plugin reports a token
 * count: WakaTime measures it at the editor, and no version control provider
 * has any idea whether a line was typed or accepted from a completion.
 */
export interface WakaTimeDuration {
  readonly ai_additions?: number;
  readonly ai_deletions?: number;
  readonly human_additions?: number;
  readonly human_deletions?: number;
  readonly ai_input_tokens?: number;
  readonly ai_output_tokens?: number;
  readonly ai_prompt_events_total?: number;
  readonly ai_sessions?: number;
  readonly ai_model_costs?: Readonly<Record<string, number>>;
}

export interface WakaTimeDurationsResponse {
  readonly data?: readonly WakaTimeDuration[];
}

const finite = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * Converts one of WakaTime's slice lists into a breakdown.
 *
 * An absent list becomes an empty breakdown rather than being propagated as
 * unknown: unlike the entity count, every one of these is genuinely empty on a
 * day somebody did not open an editor, so there is no ambiguity to preserve.
 * Unnamed slices are dropped — WakaTime emits a nameless bucket for
 * unclassified time, and a chart legend entry reading `undefined` helps nobody.
 */
export const toBreakdown = (
  slices: readonly WakaTimeSlice[] | undefined,
): WakaTimeBreakdownItem[] =>
  (slices ?? []).flatMap((slice) =>
    slice.name === undefined || slice.name === ""
      ? []
      : [
          {
            name: slice.name,
            totalSeconds: Math.round(finite(slice.total_seconds)),
            percent: Math.round(finite(slice.percent) * 10) / 10,
          },
        ],
  );

/**
 * Folds a day's durations into one AI measurement.
 *
 * Returned even when every figure is zero, because reaching this function means
 * the durations resource answered — and "WakaTime says no AI was used today" is
 * a real measurement that has to stay distinguishable from "the AI figures were
 * never collected", which is the null the caller stores instead.
 */
export const toAiMetrics = (
  durations: readonly WakaTimeDuration[],
): WakaTimeAiMetrics => {
  const modelCosts: Record<string, number> = {};
  for (const duration of durations) {
    for (const [model, cost] of Object.entries(duration.ai_model_costs ?? {})) {
      if (typeof cost !== "number" || !Number.isFinite(cost)) continue;
      modelCosts[model] = (modelCosts[model] ?? 0) + cost;
    }
  }

  const sum = (pick: (duration: WakaTimeDuration) => number | undefined): number =>
    durations.reduce((total, duration) => total + finite(pick(duration)), 0);

  return {
    inputTokens: sum((duration) => duration.ai_input_tokens),
    outputTokens: sum((duration) => duration.ai_output_tokens),
    linesAddedByAi: sum((duration) => duration.ai_additions),
    linesDeletedByAi: sum((duration) => duration.ai_deletions),
    linesAddedByHuman: sum((duration) => duration.human_additions),
    linesDeletedByHuman: sum((duration) => duration.human_deletions),
    prompts: sum((duration) => duration.ai_prompt_events_total),
    sessions: sum((duration) => duration.ai_sessions),
    modelCosts,
    daysMeasured: 1,
  };
};
