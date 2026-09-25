import {
  claudeTokenTotal, mergeClaudeMetrics,
  type ContributorSummary, type ContributorTrendPoint,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { TrendValues } from "./contributor_trend";

export const claudeUsageOf = (contributors: readonly ContributorSummary[]) => {
  const measured = contributors.filter((row) => row.claudeMetrics !== null && row.claudeMetrics !== undefined);
  return {
    people: measured.length,
    metrics: mergeClaudeMetrics(measured.flatMap((row) => row.claudeMetrics === null || row.claudeMetrics === undefined ? [] : [row.claudeMetrics])),
  };
};

export const claudeTokenSeries = (points: readonly ContributorTrendPoint[]): TrendValues[] =>
  points.map((point) => ({ day: point.day, values: {
    tokens: point.summary.claudeMetrics === null || point.summary.claudeMetrics === undefined ? null : claudeTokenTotal(point.summary.claudeMetrics),
  } }));

export const claudeUsageRanking = (contributors: readonly ContributorSummary[]) =>
  contributors.flatMap((row) => row.claudeMetrics === null || row.claudeMetrics === undefined ? [] : [{
    id: row.key, label: row.displayName, value: claudeTokenTotal(row.claudeMetrics), avatarUrl: row.avatarUrl,
    detail: "", entityRef: row.entityRef,
  }]).sort((left, right) => right.value - left.value);
