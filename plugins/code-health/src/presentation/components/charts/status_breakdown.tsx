import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import ErrorIcon from "@material-ui/icons/Error";
import HelpIcon from "@material-ui/icons/HelpOutline";
import WarningIcon from "@material-ui/icons/Warning";
import type { StatusSlice, StatusTone } from "../../../domain/entities/insights";
import { useChartPalette } from "./chart_palette";

const useStyles = makeStyles((theme) => ({
  row: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 10rem) 1fr auto",
    alignItems: "center",
    gap: theme.spacing(1.25),
    padding: theme.spacing(0.75, 0),
  },
  icon: { fontSize: "1.1rem" },
  label: { color: theme.palette.text.primary },
  bar: { width: "100%", display: "block" },
  value: {
    fontVariantNumeric: "tabular-nums",
    color: theme.palette.text.primary,
    fontWeight: 500,
  },
  share: { color: theme.palette.text.secondary, marginLeft: theme.spacing(0.75) },
}));

const ICONS: Record<StatusTone, typeof CheckCircleIcon> = {
  good: CheckCircleIcon,
  warning: WarningIcon,
  critical: ErrorIcon,
  unknown: HelpIcon,
};

const BAR_HEIGHT = 10;

export interface StatusBreakdownProps {
  readonly slices: readonly StatusSlice[];
}

/**
 * How a fixed set of states divides the fleet.
 *
 * Rows rather than a pie: comparing lengths on a shared baseline is something
 * the eye does well, and comparing angles is not — and this is the one place
 * the reserved status colours are allowed, so every row carries its own icon
 * and label and the colour never has to be decoded on its own.
 */
export const StatusBreakdown = ({ slices }: StatusBreakdownProps) => {
  const classes = useStyles();
  const palette = useChartPalette();

  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <Box role="list">
      {slices.map((slice) => {
        const Icon = ICONS[slice.tone];
        const color = palette.status[slice.tone];
        const share = total === 0 ? 0 : (slice.count / total) * 100;

        return (
          <Box
            key={slice.label}
            className={classes.row}
            role="listitem"
            aria-label={`${slice.label}: ${slice.count} of ${total}`}
          >
            <Icon className={classes.icon} style={{ color }} aria-hidden="true" />
            <Typography variant="body2" className={classes.label}>
              {slice.label}
            </Typography>
            <svg
              className={classes.bar}
              height={BAR_HEIGHT}
              aria-hidden="true"
              preserveAspectRatio="none"
              viewBox="0 0 100 10"
            >
              <rect x={0} y={0} width={100} height={BAR_HEIGHT} rx={4} fill={palette.grid} />
              <rect
                x={0}
                y={0}
                width={Math.max(share, slice.count > 0 ? 0.5 : 0)}
                height={BAR_HEIGHT}
                rx={4}
                fill={color}
              />
            </svg>
            <Box textAlign="right" whiteSpace="nowrap">
              <Typography variant="body2" component="span" className={classes.value}>
                {slice.count.toLocaleString()}
              </Typography>
              <Typography variant="caption" component="span" className={classes.share}>
                {Math.round(share)}%
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
