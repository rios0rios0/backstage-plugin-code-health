import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import IconButton from "@material-ui/core/IconButton";
import Snackbar from "@material-ui/core/Snackbar";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import TextField from "@material-ui/core/TextField";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import TuneIcon from "@material-ui/icons/Tune";
import type {
  ContributorRole,
  GetAccessResponse,
  IntegrationCapabilities,
  IntegrationId,
  ProductivityComponentId,
  ProductivityWeights,
  ProductivityWeightsByRole,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  CONTRIBUTOR_ROLE_DESCRIPTIONS,
  CONTRIBUTOR_ROLE_LABELS,
  CONTRIBUTOR_ROLES,
  DEFAULT_PRODUCTIVITY_WEIGHTS,
  formatPercent,
  INTEGRATION_IDS,
  NO_INTEGRATIONS,
  parseProductivityWeights,
  PRODUCTIVITY_COMPONENT_IDS,
  PRODUCTIVITY_COMPONENTS,
  productivityComponentsFor,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { Fragment, useMemo, useState } from "react";
import type { ScoringService } from "../../domain/services/dashboard_service";

const CONFIRMATION_MS = 6000;

const useStyles = makeStyles((theme) => ({
  paragraph: { marginBottom: theme.spacing(2) },
  headerCell: {
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    fontSize: theme.typography.pxToRem(11),
    letterSpacing: "0.05em",
  },
  component: { whiteSpace: "nowrap", verticalAlign: "top" },
  weight: { width: 112, verticalAlign: "top" },
  share: {
    textAlign: "right",
    whiteSpace: "nowrap",
    verticalAlign: "top",
    fontVariantNumeric: "tabular-nums",
    color: theme.palette.text.secondary,
  },
  integration: { display: "block", color: theme.palette.text.secondary },
  roleActions: { display: "flex", gap: theme.spacing(2), marginTop: theme.spacing(2) },
  error: { marginTop: theme.spacing(2) },
}));

/** What each integration is called where a component says it needs one. */
const INTEGRATION_LABELS: Readonly<Record<IntegrationId, string>> = {
  claude: "Claude Code",
  wakatime: "WakaTime",
  jira: "Jira",
  confluence: "Confluence",
};

/**
 * The integration a component needs, or null for one that is always scored.
 *
 * Read off the same function the score is folded from rather than written
 * out here, so a component moving between integrations can never leave the
 * editor saying the wrong thing about it.
 */
const integrationOf = (id: ProductivityComponentId): IntegrationId | null => {
  const always = productivityComponentsFor(NO_INTEGRATIONS).some((definition) => definition.id === id);
  if (always) return null;
  return (
    INTEGRATION_IDS.find((integration) =>
      productivityComponentsFor({ ...NO_INTEGRATIONS, [integration]: true }).some(
        (definition) => definition.id === id,
      ),
    ) ?? null
  );
};

/** One role's inputs, as typed: strings, so a half-typed decimal is not a number yet. */
type Draft = Readonly<Record<ProductivityComponentId, string>>;

type Drafts = Readonly<Record<ContributorRole, Draft>>;

const draftOf = (weights: ProductivityWeights): Draft =>
  Object.fromEntries(
    PRODUCTIVITY_COMPONENT_IDS.map((id) => [id, String(weights[id])]),
  ) as Record<ProductivityComponentId, string>;

const draftsOf = (weights: ProductivityWeightsByRole): Drafts =>
  Object.fromEntries(
    CONTRIBUTOR_ROLES.map((role) => [role, draftOf(weights[role])]),
  ) as Record<ContributorRole, Draft>;

/**
 * The typed set as weights, or null while it cannot be one.
 *
 * An empty field is not zero: a reader who cleared a box to type into it has
 * not said the component is worth nothing, and the set is refused until they
 * finish rather than saved half way through the keystroke.
 */
const weightsOf = (draft: Draft): ProductivityWeights | null =>
  parseProductivityWeights(
    Object.fromEntries(
      PRODUCTIVITY_COMPONENT_IDS.map((id) => [
        id,
        draft[id].trim() === "" ? Number.NaN : Number(draft[id]),
      ]),
    ),
  );

const sameWeights = (left: ProductivityWeights, right: ProductivityWeights): boolean =>
  PRODUCTIVITY_COMPONENT_IDS.every((id) => left[id] === right[id]);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface ProductivityWeightsDialogProps {
  readonly scoringService: ScoringService;
  readonly weights: ProductivityWeightsByRole;
  readonly capabilities: IntegrationCapabilities;
  readonly onClose: () => void;
  /** The roles whose sets were written; the editor is done. */
  readonly onSaved: (roles: readonly ContributorRole[]) => void;
  /** One role sent back to its defaults; the editor stays open. */
  readonly onRestored: (role: ContributorRole) => void;
}

/**
 * Every component beside its weight for each role, with the share of the
 * score that weight comes to on this install.
 *
 * The weight is what an administrator edits and the share is what a reader
 * sees, and they are not the same number: a weight says what a component is
 * worth against the others, and the share is what that comes to once the
 * weights are spread over whichever integrations are configured. Both are on
 * the row so a change to one can be read off the other before it is saved.
 */
const ProductivityWeightsDialog = ({
  scoringService,
  weights,
  capabilities,
  onClose,
  onSaved,
  onRestored,
}: ProductivityWeightsDialogProps) => {
  const classes = useStyles();
  const [drafts, setDrafts] = useState<Drafts>(() => draftsOf(weights));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What each role's draft would be scored on, and what it comes to per
  // component on this install, recomputed on every keystroke.
  const parsed = useMemo(
    () =>
      Object.fromEntries(
        CONTRIBUTOR_ROLES.map((role) => [role, weightsOf(drafts[role])]),
      ) as Record<ContributorRole, ProductivityWeights | null>,
    [drafts],
  );
  const shares = useMemo(() => {
    const byRole = new Map<ContributorRole, ReadonlyMap<string, number>>();
    for (const role of CONTRIBUTOR_ROLES) {
      const set = parsed[role];
      byRole.set(
        role,
        new Map(
          set === null
            ? []
            : productivityComponentsFor(capabilities, set).map((definition) => [
                definition.id,
                definition.weight,
              ]),
        ),
      );
    }
    return byRole;
  }, [parsed, capabilities]);

  const changed = CONTRIBUTOR_ROLES.filter((role) => {
    const set = parsed[role];
    return set !== null && !sameWeights(set, weights[role]);
  });
  const invalid = CONTRIBUTOR_ROLES.filter((role) => parsed[role] === null);
  const canSave = !isSaving && changed.length > 0 && invalid.length === 0;

  const edit = (role: ContributorRole, id: ProductivityComponentId, value: string) =>
    setDrafts((current) => ({ ...current, [role]: { ...current[role], [id]: value } }));

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      for (const role of changed) {
        const set = parsed[role];
        if (set !== null) await scoringService.updateProductivityWeights(role, set);
      }
      onSaved(changed);
    } catch (caught) {
      // Kept inside the dialog: the reader is mid-edit, and the two answers to
      // a refusal — correct the numbers, or give up — are both here.
      setError(messageOf(caught));
    } finally {
      setIsSaving(false);
    }
  };

  // Restores one role and stays open. Closing here would throw away whatever
  // was typed into the other role's column, and the two are edited together.
  const restore = async (role: ContributorRole) => {
    setIsSaving(true);
    setError(null);
    try {
      await scoringService.resetProductivityWeights(role);
      setDrafts((current) => ({ ...current, [role]: draftOf(DEFAULT_PRODUCTIVITY_WEIGHTS[role]) }));
      onRestored(role);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="productivityWeightsTitle">
      <DialogTitle id="productivityWeightsTitle">Productivity score weights</DialogTitle>
      <DialogContent>
        <Typography variant="body2" className={classes.paragraph}>
          A weight says what a component is worth against the others for people of that role;
          the share beside it is what that comes to once the weights are spread over the
          integrations this backend is configured with. A component weighted at zero stays in
          the workings with no say. Nothing collected changes: every window ever collected is
          scored through the new numbers from the next read.
        </Typography>

        <Table size="small" aria-label="Productivity score weights">
          <TableHead>
            <TableRow>
              <TableCell className={classes.headerCell}>Component</TableCell>
              {CONTRIBUTOR_ROLES.map((role) => (
                <TableCell key={role} className={classes.headerCell} colSpan={2}>
                  <Tooltip title={CONTRIBUTOR_ROLE_DESCRIPTIONS[role]}>
                    <span>{CONTRIBUTOR_ROLE_LABELS[role]}</span>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {PRODUCTIVITY_COMPONENT_IDS.map((id) => {
              const integration = integrationOf(id);
              const configured = integration === null || capabilities[integration];

              return (
                <TableRow key={id}>
                  <TableCell className={classes.component}>
                    <Typography variant="body2">{PRODUCTIVITY_COMPONENTS[id].label}</Typography>
                    {integration === null ? null : (
                      <Typography variant="caption" className={classes.integration}>
                        {`${INTEGRATION_LABELS[integration]} only${
                          configured ? "" : " — not configured, so it carries nothing here"
                        }`}
                      </Typography>
                    )}
                  </TableCell>
                  {CONTRIBUTOR_ROLES.map((role) => {
                    const share = shares.get(role)?.get(id);

                    return (
                      <Fragment key={role}>
                        <TableCell className={classes.weight}>
                          <TextField
                            type="number"
                            size="small"
                            fullWidth
                            value={drafts[role][id]}
                            disabled={isSaving}
                            error={parsed[role] === null}
                            onChange={(event) => edit(role, id, event.target.value)}
                            inputProps={{
                              min: 0,
                              step: 0.05,
                              "aria-label": `${CONTRIBUTOR_ROLE_LABELS[role]} weight for ${
                                PRODUCTIVITY_COMPONENTS[id].label
                              }`,
                            }}
                          />
                        </TableCell>
                        <TableCell className={classes.share}>
                          {share === undefined ? "—" : formatPercent(share * 100, 0)}
                        </TableCell>
                      </Fragment>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Box className={classes.roleActions}>
          {CONTRIBUTOR_ROLES.map((role) => (
            <Button
              key={role}
              size="small"
              disabled={isSaving || sameWeights(weights[role], DEFAULT_PRODUCTIVITY_WEIGHTS[role])}
              onClick={() => void restore(role)}
            >
              {`Restore ${CONTRIBUTOR_ROLE_LABELS[role].toLowerCase()} defaults`}
            </Button>
          ))}
        </Box>

        {invalid.length === 0 ? null : (
          <Typography variant="body2" color="error" className={classes.error}>
            Every component needs a weight of zero or more, and at least one has to be above
            zero.
          </Typography>
        )}

        {error === null ? null : (
          <Typography variant="body2" color="error" className={classes.error}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button color="primary" variant="contained" disabled={!canSave} onClick={() => void save()}>
          Save weights
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export interface ProductivityWeightsButtonProps {
  /** What the backend said this caller may do. */
  readonly access: GetAccessResponse;
  readonly scoringService: ScoringService;
  /** The weights in force, as the backend last answered. */
  readonly weights: ProductivityWeightsByRole;
  readonly capabilities: IntegrationCapabilities;
  /** Called after a change was accepted, so the caller can re-read the weights. */
  readonly onSaved: () => void;
}

/**
 * The administrator's control over how the productivity score is read.
 *
 * Drawn only for a caller the backend says may change the weights, for the
 * same reason the reset control is: the answer comes from the backend, so the
 * control and the routes it calls can never disagree — and the routes
 * authorise again regardless.
 */
export const ProductivityWeightsButton = ({
  access,
  scoringService,
  weights,
  capabilities,
  onSaved,
}: ProductivityWeightsButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!access.canManageScoring) return null;

  const done = (roles: readonly ContributorRole[]) => {
    setIsOpen(false);
    setNotice(
      `Productivity weights saved for ${roles
        .map((role) => CONTRIBUTOR_ROLE_LABELS[role].toLowerCase())
        .join(" and ")}. Every score is read through them from now on.`,
    );
    onSaved();
  };

  const restored = (role: ContributorRole) => {
    setNotice(
      `${CONTRIBUTOR_ROLE_LABELS[role]} weights restored to the defaults. Every score is read through them from now on.`,
    );
    onSaved();
  };

  return (
    <>
      <Tooltip title="Productivity score weights">
        <IconButton
          size="small"
          color="inherit"
          aria-label="Productivity score weights"
          onClick={() => setIsOpen(true)}
        >
          <TuneIcon />
        </IconButton>
      </Tooltip>

      {isOpen ? (
        <ProductivityWeightsDialog
          scoringService={scoringService}
          weights={weights}
          capabilities={capabilities}
          onClose={() => setIsOpen(false)}
          onSaved={done}
          onRestored={restored}
        />
      ) : null}

      <Snackbar
        open={notice !== null}
        autoHideDuration={CONFIRMATION_MS}
        onClose={() => setNotice(null)}
        message={notice ?? ""}
      />
    </>
  );
};
