import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { useCallback, useMemo, useRef, useState } from "react";
import type { CadencePoint } from "../../../domain/entities/insights";
import { useChartPalette } from "./chart_palette";

const useStyles = makeStyles((theme) => ({
  wrapper: { position: "relative", width: "100%" },
  svg: { display: "block", width: "100%", overflow: "visible" },
  legend: {
    display: "flex",
    gap: theme.spacing(2),
    alignItems: "center",
    marginBottom: theme.spacing(1),
  },
  legendEntry: { display: "flex", alignItems: "center", gap: theme.spacing(0.75) },
  swatch: { width: 10, height: 10, borderRadius: 2, display: "inline-block" },
  legendLabel: { color: theme.palette.text.secondary },
  tick: { fill: theme.palette.text.secondary, fontSize: 10 },
  tooltip: {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 2,
    background: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[3],
    padding: theme.spacing(1, 1.25),
    whiteSpace: "nowrap",
  },
  tooltipRow: { display: "flex", alignItems: "center", gap: theme.spacing(0.75) },
  empty: { color: theme.palette.text.secondary, padding: theme.spacing(3, 0) },
}));

const WIDTH = 720;
const HEIGHT = 200;
const PADDING = { top: 8, right: 8, bottom: 22, left: 36 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

/** A y-axis top that lands on a round number, so the gridline labels read cleanly. */
const niceCeiling = (value: number): number => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
};

const formatDay = (day: string): string => {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

interface Series {
  readonly key: keyof Omit<CadencePoint, "day">;
  readonly label: string;
  readonly color: string;
}

export interface CadenceChartProps {
  readonly points: readonly CadencePoint[];
}

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
export const CadenceChart = ({ points }: CadenceChartProps) => {
  const classes = useStyles();
  const palette = useChartPalette();
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const series: Series[] = useMemo(
    () => [
      { key: "commits", label: "Commits", color: palette.series[0] },
      { key: "pullRequestsMerged", label: "Pull requests merged", color: palette.series[1] },
    ],
    [palette],
  );

  const max = useMemo(
    () =>
      niceCeiling(
        Math.max(1, ...points.flatMap((point) => [point.commits, point.pullRequestsMerged])),
      ),
    [points],
  );

  const xOf = useCallback(
    (index: number): number =>
      points.length <= 1
        ? PADDING.left + PLOT_WIDTH / 2
        : PADDING.left + (index / (points.length - 1)) * PLOT_WIDTH,
    [points.length],
  );

  const yOf = useCallback(
    (value: number): number => PADDING.top + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT,
    [max],
  );

  const onMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || points.length === 0) return;

      const bounds = svg.getBoundingClientRect();
      // The viewBox scales to the container, so the pointer has to be mapped
      // back into viewBox units before it means anything.
      const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
      const ratio = (x - PADDING.left) / PLOT_WIDTH;
      const index = Math.round(ratio * (points.length - 1));
      setHovered(Math.min(points.length - 1, Math.max(0, index)));
    },
    [points.length],
  );

  if (points.length === 0) {
    return (
      <Typography variant="body2" className={classes.empty}>
        No activity was recorded in this window.
      </Typography>
    );
  }

  const lineFor = (key: Series["key"]): string =>
    points.map((point, index) => `${xOf(index)},${yOf(point[key])}`).join(" ");

  const areaFor = (key: Series["key"]): string =>
    `${PADDING.left},${PADDING.top + PLOT_HEIGHT} ${lineFor(key)} ${
      PADDING.left + PLOT_WIDTH
    },${PADDING.top + PLOT_HEIGHT}`;

  const gridValues = [0, max / 2, max];
  const active = hovered === null ? null : points[hovered];
  // Flip the tooltip to the left of the crosshair once it would overflow the
  // right edge, so the last bucket is still readable.
  const tooltipLeft = hovered === null ? 0 : (xOf(hovered) / WIDTH) * 100;
  const flip = tooltipLeft > 65;

  return (
    <Box>
      <Box className={classes.legend}>
        {series.map((entry) => (
          <Box key={entry.key} className={classes.legendEntry}>
            <span className={classes.swatch} style={{ background: entry.color }} />
            <Typography variant="caption" className={classes.legendLabel}>
              {entry.label}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box className={classes.wrapper}>
        <svg
          ref={svgRef}
          className={classes.svg}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Commits and merged pull requests from ${formatDay(
            points[0].day,
          )} to ${formatDay(points[points.length - 1].day)}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHovered(null)}
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + PLOT_WIDTH}
                y1={yOf(value)}
                y2={yOf(value)}
                stroke={palette.grid}
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 6}
                y={yOf(value) + 3}
                textAnchor="end"
                className={classes.tick}
              >
                {Math.round(value).toLocaleString()}
              </text>
            </g>
          ))}

          <polygon points={areaFor("commits")} fill={palette.series[0]} opacity={0.16} />
          <polyline
            points={lineFor("commits")}
            fill="none"
            stroke={palette.series[0]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={lineFor("pullRequestsMerged")}
            fill="none"
            stroke={palette.series[1]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hovered !== null ? (
            <g>
              <line
                x1={xOf(hovered)}
                x2={xOf(hovered)}
                y1={PADDING.top}
                y2={PADDING.top + PLOT_HEIGHT}
                stroke={palette.axis}
                strokeWidth={1}
              />
              {series.map((entry) => (
                <circle
                  key={entry.key}
                  cx={xOf(hovered)}
                  cy={yOf(points[hovered][entry.key])}
                  r={4}
                  fill={entry.color}
                  // A 2px ring in the surface colour keeps the two markers
                  // legible where the series touch.
                  stroke={theme.palette.background.paper}
                  strokeWidth={2}
                />
              ))}
            </g>
          ) : null}

          <text x={PADDING.left} y={HEIGHT - 4} className={classes.tick}>
            {formatDay(points[0].day)}
          </text>
          <text
            x={PADDING.left + PLOT_WIDTH}
            y={HEIGHT - 4}
            textAnchor="end"
            className={classes.tick}
          >
            {formatDay(points[points.length - 1].day)}
          </text>
        </svg>

        {active ? (
          <div
            className={classes.tooltip}
            style={{
              left: `${tooltipLeft}%`,
              top: 0,
              transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <Typography variant="caption" color="textSecondary">
              {formatDay(active.day)}
            </Typography>
            {series.map((entry) => (
              <Box key={entry.key} className={classes.tooltipRow}>
                <span className={classes.swatch} style={{ background: entry.color }} />
                <Typography variant="body2">
                  {entry.label}: <strong>{active[entry.key].toLocaleString()}</strong>
                </Typography>
              </Box>
            ))}
          </div>
        ) : null}
      </Box>
    </Box>
  );
};
