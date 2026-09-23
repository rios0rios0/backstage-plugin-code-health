import TextField from "@material-ui/core/TextField";
import Tooltip from "@material-ui/core/Tooltip";
import { makeStyles } from "@material-ui/core/styles";
import type {
  ContributorRole,
  ContributorSummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  CONTRIBUTOR_ROLE_DESCRIPTIONS,
  CONTRIBUTOR_ROLE_LABELS,
  CONTRIBUTOR_ROLES,
  isContributorRole,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { StateChip } from "./state_chip";

const useStyles = makeStyles(() => ({
  select: { minWidth: 120 },
}));

export interface ContributorRoleCellProps {
  readonly contributor: ContributorSummary;
  /** Whether the reader may change the role, as the backend answered. */
  readonly canAssign: boolean;
  readonly isBusy: boolean;
  readonly onAssign: (role: ContributorRole) => void;
}

/**
 * What a person is scored as, and — for an administrator — the control that
 * changes it.
 *
 * A chip for everybody, because the role decides which weights the score in
 * the next column was folded through, and a reader comparing two scores has
 * to be able to see that one is a lead's. A select for an administrator, in
 * the row rather than on a separate screen: the score is what the role is
 * for, and the moment somebody reads a reviewer's score and thinks "she is a
 * lead, that is why" is the moment to say so.
 *
 * No confirmation, for the same reason an exclusion has none: nothing is
 * deleted, the change is retroactive and reversible with the same control,
 * and a dialog guarding a reversible action trains people to click through
 * dialogs.
 */
export const ContributorRoleCell = ({
  contributor,
  canAssign,
  isBusy,
  onAssign,
}: ContributorRoleCellProps) => {
  const classes = useStyles();
  const description = CONTRIBUTOR_ROLE_DESCRIPTIONS[contributor.role];

  if (!canAssign) {
    return (
      <Tooltip title={description}>
        <span>
          <StateChip
            tone={contributor.role === "lead" ? "info" : "neutral"}
            label={CONTRIBUTOR_ROLE_LABELS[contributor.role]}
          />
        </span>
      </Tooltip>
    );
  }

  return (
    <TextField
      select
      size="small"
      className={classes.select}
      value={contributor.role}
      disabled={isBusy}
      onChange={(event) => {
        const { value } = event.target;
        if (isContributorRole(value) && value !== contributor.role) onAssign(value);
      }}
      SelectProps={{ native: true }}
      inputProps={{
        "aria-label": `Role of ${contributor.displayName}`,
        title: description,
      }}
    >
      {CONTRIBUTOR_ROLES.map((role) => (
        <option key={role} value={role}>
          {CONTRIBUTOR_ROLE_LABELS[role]}
        </option>
      ))}
    </TextField>
  );
};
