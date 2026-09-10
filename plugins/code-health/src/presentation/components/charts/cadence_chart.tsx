import type { CadencePoint } from "../../../domain/entities/insights";
import { formatTrendDay, TrendChart, type TrendSeries } from "./trend_chart";

export interface CadenceChartProps {
  readonly points: readonly CadencePoint[];
}

const SERIES: readonly TrendSeries[] = [
  { key: "commits", label: "Commits", area: true },
  { key: "pullRequestsMerged", label: "Pull requests merged" },
];

/**
 * Delivery cadence over the selected window.
 *
 * Two series on **one** y-axis. Commits and merged pull requests are both
 * counts of events, so they share a scale honestly; a second axis would let the
 * two lines cross wherever the scales were chosen to make them cross, which is
 * the most common way a chart like this lies.
 *
 * Commits are filled and pull requests are a plain line: the fill reads as the
 * volume underneath, the line as the smaller number riding on top of it.
 */
export const CadenceChart = ({ points }: CadenceChartProps) => (
  <TrendChart
    points={points.map((point) => ({
      day: point.day,
      values: { commits: point.commits, pullRequestsMerged: point.pullRequestsMerged },
    }))}
    series={SERIES}
    emptyMessage="No activity was recorded in this window."
    ariaLabel={
      points.length === 0
        ? undefined
        : `Commits and merged pull requests from ${formatTrendDay(
            points[0].day,
          )} to ${formatTrendDay(points[points.length - 1].day)}`
    }
  />
);
