import { InfoCard, Progress, WarningPanel } from "@backstage/core-components";
import { useRouteRef } from "@backstage/core-plugin-api";
import Box from "@material-ui/core/Box";
import Link from "@material-ui/core/Link";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableContainer from "@material-ui/core/TableContainer";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import type {
  OwnershipInfo,
  RepositoryHealthScore,
  RepositorySummary,
  ScoreBand,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  computeRepositoryHealthScore,
  formatScoreValue,
  scoreBand,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { repositoryDetailRouteRef, rootRouteRef } from "../../routes";
import { ComplianceBadge } from "./compliance_badge";
import { DocumentationBadge } from "./documentation_badge";
import { EmptyCell } from "./empty_cell";
import { SCORE_BAND_LABELS } from "./score_card";
import { StateChip } from "./state_chip";
import { StatusBadge } from "./status_badge";

const useStyles = makeStyles((theme) => ({
  headerCell: {
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    fontSize: theme.typography.pxToRem(11),
    letterSpacing: "0.05em",
  },
  cell: { whiteSpace: "nowrap" },
  score: { fontWeight: 500, fontVariantNumeric: "tabular-nums" },
  owners: { display: "block", marginTop: theme.spacing(1) },
  explanation: { color: theme.palette.text.secondary },
}));

/**
 * Which of the theme's status colours each band borrows.
 *
 * The same three the rate columns already use, so a score of 40 on this card
 * and an approval rate of 40% on the contributors table read as the same
 * degree of bad rather than as two unrelated palettes.
 */
const BAND_COLORS: Readonly<Record<ScoreBand, "success" | "warning" | "error" | "disabled">> =
  {
    good: "success",
    fair: "warning",
    poor: "error",
    unknown: "disabled",
  };

const useBandStyles = makeStyles((theme) => ({
  success: { color: theme.palette.success.main },
  warning: { color: theme.palette.warning.main },
  error: { color: theme.palette.error.main },
  disabled: { color: theme.palette.text.secondary },
}));

/** A repository with its health worked out once, so sorting and rendering agree. */
interface GradedRepository {
  readonly repository: RepositorySummary;
  readonly score: RepositoryHealthScore;
}

/**
 * Worst first, with the unmeasured after everything measured.
 *
 * Ascending because the reason to open somebody's page is to find what needs
 * attention, and a list that leads with the healthiest repository buries it.
 * A repository nothing has measured yet is not the worst one — it is a
 * different problem — so it sits after the ones that have a figure rather
 * than sorting as a zero.
 */
export const gradeAndSort = (
  repositories: readonly RepositorySummary[],
): GradedRepository[] =>
  repositories
    .map((repository) => ({ repository, score: computeRepositoryHealthScore(repository) }))
    .sort((left, right) => {
      if (left.score.value === null) return right.score.value === null ? 0 : 1;
      if (right.score.value === null) return -1;
      return left.score.value - right.score.value;
    });

const HealthCell = ({ score }: { score: RepositoryHealthScore }) => {
  const classes = useStyles();
  const bands = useBandStyles();
  const band = scoreBand(score.value);

  return (
    <Tooltip
      title={
        // The whole working, not just the number: a repository graded 41 with
        // one measured component and one graded 41 with eleven are different
        // claims, and only the components say which this is.
        score.components
          .map((component) => `${component.label}: ${component.detail}`)
          .join("\n")
      }
    >
      <Typography
        variant="body2"
        component="span"
        className={`${classes.score} ${bands[BAND_COLORS[band]]}`}
        data-band={band}
        tabIndex={0}
        aria-label={`Health ${formatScoreValue(score.value)} out of 100, ${SCORE_BAND_LABELS[band]}`}
      >
        {formatScoreValue(score.value)}
      </Typography>
    </Tooltip>
  );
};

const QualityGateCell = ({ repository }: { repository: RepositorySummary }) => {
  const status = repository.sonarMetrics?.qualityGateStatus;
  if (!status || status === "NONE") return <EmptyCell />;
  return status === "OK" ? (
    <StateChip tone="success" label="Passed" />
  ) : (
    <StateChip tone="error" label="Failed" />
  );
};

const MetricCell = ({ value }: { value: string | number | null }) =>
  value === null || value === undefined ? (
    <EmptyCell />
  ) : (
    <Typography variant="body2">{value}</Typography>
  );

const HEADINGS = [
  "Repository",
  "Health",
  "Quality gate",
  "Bugs",
  "Vulns",
  "Coverage",
  "Debt",
  "CI",
  "Compliance",
  "Docs",
];

const OwnedTable = ({ graded }: { graded: readonly GradedRepository[] }) => {
  const classes = useStyles();
  const repositoryPath = useRouteRef(repositoryDetailRouteRef);

  return (
    <TableContainer>
      <Table size="small" aria-label="Owned repositories">
        <TableHead>
          <TableRow>
            {HEADINGS.map((heading) => (
              <TableCell key={heading} className={classes.headerCell}>
                {heading}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {graded.map(({ repository, score }) => (
            <TableRow key={repository.id}>
              <TableCell className={classes.cell}>
                <Link
                  component={RouterLink}
                  to={repositoryPath({ id: repository.id })}
                  title="Open the repository's page"
                >
                  {repository.name}
                </Link>
              </TableCell>
              <TableCell className={classes.cell}>
                <HealthCell score={score} />
              </TableCell>
              <TableCell className={classes.cell}>
                <QualityGateCell repository={repository} />
              </TableCell>
              <TableCell className={classes.cell}>
                <MetricCell value={repository.sonarMetrics?.bugs ?? null} />
              </TableCell>
              <TableCell className={classes.cell}>
                <MetricCell value={repository.sonarMetrics?.vulnerabilities ?? null} />
              </TableCell>
              <TableCell className={classes.cell}>
                <MetricCell
                  value={
                    repository.sonarMetrics
                      ? `${repository.sonarMetrics.coverage.toFixed(1)}%`
                      : null
                  }
                />
              </TableCell>
              <TableCell className={classes.cell}>
                <MetricCell value={repository.sonarMetrics?.technicalDebt ?? null} />
              </TableCell>
              <TableCell className={classes.cell}>
                <StatusBadge state={repository.ciStatus?.state ?? null} />
              </TableCell>
              <TableCell className={classes.cell}>
                <ComplianceBadge status={repository.complianceStatus} />
              </TableCell>
              <TableCell className={classes.cell}>
                <DocumentationBadge status={repository.documentation} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export interface OwnedRepositoriesCardProps {
  readonly ownership: OwnershipInfo | null;
  readonly repositories: readonly RepositorySummary[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

/**
 * What this person is responsible for, and how it is holding up.
 *
 * Responsibility here is the catalog's `spec.owner` matched against the
 * person's `User` entity and the groups they belong to — deliberately a
 * different question from where they committed. Somebody can own a repository
 * they have not touched all quarter, and that is precisely the row worth
 * seeing on their page.
 *
 * The three empty states are three different conversations, so none of them is
 * allowed to collapse into "no repositories": an unlinked account cannot own
 * anything at all until somebody links it, a linked person may genuinely own
 * nothing, and either is different from a request that failed.
 */
export const OwnedRepositoriesCard = ({
  ownership,
  repositories,
  isLoading,
  error,
}: OwnedRepositoriesCardProps) => {
  const classes = useStyles();
  const rootPath = useRouteRef(rootRouteRef);
  const graded = useMemo(() => gradeAndSort(repositories), [repositories]);

  // The tab lives directly under the plugin root; the trailing slash a route ref
  // may or may not carry would otherwise double up in the middle of the path.
  const identitiesPath = `${rootPath().replace(/\/$/u, "")}/identities`;

  const body = () => {
    if (error !== null) {
      return (
        <WarningPanel
          severity="error"
          title="Failed to load the owned repositories"
          message={error}
        />
      );
    }

    if (ownership === null) return isLoading ? <Progress /> : null;

    if (ownership.entityRef === null) {
      return (
        <Typography variant="body2" className={classes.explanation}>
          This account is not linked to a catalog user, so there is nobody for a
          repository to name as its owner. Link it on the{" "}
          <Link component={RouterLink} to={identitiesPath}>
            Identities tab
          </Link>{" "}
          and whatever their user or their groups own will appear here.
        </Typography>
      );
    }

    if (graded.length === 0) {
      return (
        <Typography variant="body2" className={classes.explanation}>
          No catalog entity names {ownership.entityRef} — or any group they belong
          to — as its owner, so nothing here is theirs to look after.
          {ownership.owners.length > 0 ? (
            <Typography variant="caption" component="span" className={classes.owners}>
              Matched against: {ownership.owners.join(", ")}.
            </Typography>
          ) : null}
        </Typography>
      );
    }

    return <OwnedTable graded={graded} />;
  };

  return (
    <InfoCard
      title="Owned repositories"
      subheader="Repositories whose catalog entity names this person, or a group they belong to, as its owner. Worst health first — this is the list to work down."
    >
      <Box>{body()}</Box>
    </InfoCard>
  );
};
