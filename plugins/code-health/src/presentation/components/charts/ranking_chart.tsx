import { catalogEntityPath } from "@rios0rios0/backstage-plugin-code-health-common";
import Avatar from "@material-ui/core/Avatar";
import Box from "@material-ui/core/Box";
import Link from "@material-ui/core/Link";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import { Link as RouterLink } from "react-router-dom";
import type { RankedItem } from "../../../domain/entities/insights";
import { useChartPalette } from "./chart_palette";

const useStyles = makeStyles((theme) => ({
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 11rem) 1fr auto",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(0.75, 0),
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    minWidth: 0,
  },
  avatar: { width: 24, height: 24, fontSize: "0.7rem" },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme.palette.text.primary,
  },
  // The track is the empty remainder of the bar. Recessive by design: it is a
  // reference, not data.
  track: { width: "100%", display: "block" },
  value: {
    fontVariantNumeric: "tabular-nums",
    color: theme.palette.text.primary,
    fontWeight: 500,
  },
  detail: { color: theme.palette.text.secondary },
  empty: { color: theme.palette.text.secondary, padding: theme.spacing(2, 0) },
}));

const BAR_HEIGHT = 10;
const RADIUS = 4;

const initialsOf = (label: string): string =>
  label
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

export interface RankingChartProps {
  readonly items: readonly RankedItem[];
  /** Noun for the value, e.g. `commits`. Used in the tooltip and the aria label. */
  readonly unit: string;
  readonly showAvatars?: boolean;
  readonly emptyMessage: string;
}

/**
 * A horizontal ranking.
 *
 * Horizontal rather than vertical because the categories are names: a vertical
 * bar chart would tilt them 45° or truncate them, and the whole point of the
 * chart is knowing who is on it.
 *
 * One hue, varying only in length. The bars encode magnitude, not identity, so
 * painting each a different colour would imply a category difference that is
 * not there — and would repaint every bar whenever the ranking changed.
 */
export const RankingChart = ({
  items,
  unit,
  showAvatars = false,
  emptyMessage,
}: RankingChartProps) => {
  const classes = useStyles();
  const palette = useChartPalette();

  if (items.length === 0) {
    return (
      <Typography variant="body2" className={classes.empty}>
        {emptyMessage}
      </Typography>
    );
  }

  const max = Math.max(...items.map((item) => item.value));

  return (
    <Box role="list">
      {items.map((item) => {
        const path = item.entityRef === null ? null : catalogEntityPath(item.entityRef);
        const width = max === 0 ? 0 : (item.value / max) * 100;

        return (
          <Box
            key={item.id}
            className={classes.row}
            role="listitem"
            aria-label={`${item.label}: ${item.value} ${unit}, ${item.detail}`}
          >
            <Box className={classes.identity}>
              {showAvatars ? (
                <Avatar
                  className={classes.avatar}
                  src={item.avatarUrl ?? undefined}
                  alt=""
                >
                  {initialsOf(item.label)}
                </Avatar>
              ) : null}
              <Tooltip title={item.label}>
                <Typography variant="body2" className={classes.label}>
                  {path === null ? (
                    item.label
                  ) : (
                    <Link component={RouterLink} to={path} color="inherit">
                      {item.label}
                    </Link>
                  )}
                </Typography>
              </Tooltip>
            </Box>

            <Tooltip title={`${item.value} ${unit} · ${item.detail}`}>
              <svg
                className={classes.track}
                height={BAR_HEIGHT}
                role="img"
                aria-hidden="true"
                preserveAspectRatio="none"
                viewBox="0 0 100 10"
              >
                <rect
                  x={0}
                  y={0}
                  width={100}
                  height={BAR_HEIGHT}
                  rx={RADIUS}
                  fill={palette.grid}
                />
                <rect
                  x={0}
                  y={0}
                  width={Math.max(width, 0.5)}
                  height={BAR_HEIGHT}
                  rx={RADIUS}
                  fill={palette.series[0]}
                />
              </svg>
            </Tooltip>

            <Box textAlign="right">
              <Typography variant="body2" className={classes.value}>
                {item.value.toLocaleString()}
              </Typography>
              <Typography variant="caption" className={classes.detail}>
                {item.detail}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
