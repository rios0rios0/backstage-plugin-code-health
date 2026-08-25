import Box from "@material-ui/core/Box";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";

const useStyles = makeStyles((theme) => ({
  value: {
    fontSize: "2rem",
    lineHeight: 1.1,
    fontWeight: 500,
    // Deliberately ink, not a series colour. A number is text; the colour would
    // claim an identity the tile does not have.
    color: theme.palette.text.primary,
  },
  label: {
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: "0.7rem",
  },
  caption: { color: theme.palette.text.secondary },
  help: { fontSize: "0.9rem", opacity: 0.6 },
}));

export interface StatTileProps {
  readonly label: string;
  /** Already formatted — the tile does no rounding of its own. */
  readonly value: string;
  readonly caption?: string;
  /** Shown behind a question mark, for a figure whose definition is not obvious. */
  readonly help?: string;
}

/**
 * A single headline figure.
 *
 * Six of these beat six one-bar charts: the value *is* the message, and a plot
 * of one number carries no comparison for the eye to make.
 */
export const StatTile = ({ label, value, caption, help }: StatTileProps) => {
  const classes = useStyles();

  return (
    <Box>
      <Box display="flex" alignItems="center" style={{ gap: 4 }}>
        <Typography className={classes.label}>{label}</Typography>
        {help ? (
          <Tooltip title={help}>
            {/* Focusable and announced, for the same reasons as the table
                headings — `SvgIcon` hides an icon with no `titleAccess` from
                assistive technology, and an SVG has no focus event of its own. */}
            <HelpOutlineIcon className={classes.help} titleAccess={help} tabIndex={0} />
          </Tooltip>
        ) : null}
      </Box>
      <Typography className={classes.value}>{value}</Typography>
      {caption ? (
        <Typography variant="caption" className={classes.caption}>
          {caption}
        </Typography>
      ) : null}
    </Box>
  );
};
