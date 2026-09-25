import type { TimeWindow } from "./api";
import { RATE_PERIODS } from "./contributor_rates";

/** Claude Code consumption, never a component of the productivity score. */
export interface ClaudeTokens {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface ClaudeDayMetrics extends ClaudeTokens {
  readonly day: string;
}

export interface ClaudeMetrics extends ClaudeTokens {
  /** UTC days actually reported for this account, not inferred quiet days. */
  readonly daily: readonly ClaudeDayMetrics[];
}

export const claudeTokenTotal = (tokens: ClaudeTokens): number =>
  tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheCreationTokens;

/** Daily provider reports cannot be sliced into hours. Count UTC dates touched. */
export const claudeWindowDays = (window: TimeWindow): number => {
  const from = new Date(window.from).getTime();
  const to = new Date(window.to).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 1;
  return Math.floor((to - 1) / 86400000) - Math.floor(from / 86400000) + 1;
};

export const claudeRatesOf = (metrics: ClaudeMetrics, days: number) => {
  const daily = claudeTokenTotal(metrics) / Math.max(1, days);
  return { daily, weekly: daily * RATE_PERIODS.weekly.days, monthly: daily * RATE_PERIODS.monthly.days };
};

const sumTokens = (parts: readonly ClaudeTokens[]): ClaudeTokens => ({
  inputTokens: parts.reduce((sum, part) => sum + part.inputTokens, 0),
  outputTokens: parts.reduce((sum, part) => sum + part.outputTokens, 0),
  cacheReadTokens: parts.reduce((sum, part) => sum + part.cacheReadTokens, 0),
  cacheCreationTokens: parts.reduce((sum, part) => sum + part.cacheCreationTokens, 0),
});

/** Combines accounts and days without counting a day twice in the daily series. */
export const mergeClaudeMetrics = (parts: readonly ClaudeMetrics[]): ClaudeMetrics | null => {
  if (parts.length === 0) return null;
  const daily = parts.flatMap((part) => part.daily);
  const days = [...new Set(daily.map((part) => part.day))].sort();
  return {
    ...sumTokens(parts),
    daily: days.map((day) => ({ day, ...sumTokens(daily.filter((part) => part.day === day)) })),
  };
};
