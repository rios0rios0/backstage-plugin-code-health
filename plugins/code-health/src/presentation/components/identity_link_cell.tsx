import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Chip from "@material-ui/core/Chip";
import Link from "@material-ui/core/Link";
import TextField from "@material-ui/core/TextField";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import type { IdentityRow } from "@rios0rios0/backstage-plugin-code-health-common";
import { catalogEntityPath } from "@rios0rios0/backstage-plugin-code-health-common";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";

const useStyles = makeStyles((theme) => ({
  suggestions: { display: "flex", flexWrap: "wrap", gap: theme.spacing(0.5) },
  manual: { display: "flex", alignItems: "center", gap: theme.spacing(1), marginTop: theme.spacing(1) },
  input: { minWidth: 260 },
  origin: { color: theme.palette.text.secondary },
}));

export interface IdentityLinkCellProps {
  readonly row: IdentityRow;
  readonly onLink: (entityRef: string) => void;
  readonly onUnlink: () => void;
  readonly isBusy: boolean;
}

/**
 * The half of a row where a person says who an account belongs to.
 *
 * Suggestions come first and are one click, because the ranked match is right
 * the overwhelming majority of the time and the whole point of the screen is
 * that linking a fleet's worth of accounts should not take an afternoon. The
 * free-text field behind them exists for the rest — a bot with a plausible
 * name, somebody whose accounts share nothing — and is deliberately plain: an
 * entity reference is what the backend validates against, so letting somebody
 * type one and be told plainly that it does not exist beats a picker that has
 * to enumerate a directory of thousands to open.
 */
export const IdentityLinkCell = ({ row, onLink, onUnlink, isBusy }: IdentityLinkCellProps) => {
  const classes = useStyles();
  const [entityRef, setEntityRef] = useState("");

  if (row.link !== null) {
    const path = catalogEntityPath(row.link.entityRef);

    return (
      <Box>
        <Typography variant="body2">
          {path === null ? (
            row.link.entityRef
          ) : (
            <Link component={RouterLink} to={path} title="Open in the catalog">
              {row.link.entityRef}
            </Link>
          )}
        </Typography>
        <Box display="flex" alignItems="center" gridGap={8}>
          <Typography variant="caption" className={classes.origin}>
            {row.link.origin === "manual"
              ? `linked by ${row.link.linkedBy ?? "a person"}`
              : "matched on the e-mail address"}
          </Typography>
          <Button size="small" onClick={onUnlink} disabled={isBusy}>
            Unlink
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {row.suggestions.length === 0 ? (
        <Typography variant="caption" color="textSecondary">
          Nothing in the catalog resembles this account.
        </Typography>
      ) : (
        <Box className={classes.suggestions}>
          {row.suggestions.map((suggestion) => (
            <Tooltip
              key={suggestion.entityRef}
              title={`${suggestion.reason} — ${suggestion.entityRef}`}
            >
              <Chip
                size="small"
                clickable
                disabled={isBusy}
                label={suggestion.displayName ?? suggestion.entityRef}
                onClick={() => onLink(suggestion.entityRef)}
              />
            </Tooltip>
          ))}
        </Box>
      )}

      <Box className={classes.manual}>
        <TextField
          size="small"
          className={classes.input}
          placeholder="user:default/name"
          label="Link to another user"
          value={entityRef}
          onChange={(event) => setEntityRef(event.target.value)}
          inputProps={{ "aria-label": `Catalog user for ${row.identity.sourceKey}` }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={isBusy || entityRef.trim() === ""}
          onClick={() => onLink(entityRef.trim())}
        >
          Link
        </Button>
      </Box>
    </Box>
  );
};
