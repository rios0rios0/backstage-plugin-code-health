import { useMemo, useState } from "react";
import Avatar from "@material-ui/core/Avatar";
import Box from "@material-ui/core/Box";
import Link from "@material-ui/core/Link";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ContributorSummary,
  IntegrationCapabilities,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  catalogEntityPath,
  NO_INTEGRATIONS,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { Link as RouterLink } from "react-router-dom";
import { confluenceContributorColumns } from "./columns/confluence_columns";
import { jiraContributorColumns } from "./columns/jira_columns";
import {
  hasAiMetrics,
  wakaTimeAiColumns,
  wakaTimeContributorColumns,
} from "./columns/wakatime_columns";
import { DataTable, PaginationControls } from "./data_table";
import { EmptyCell } from "./empty_cell";

interface ContributorsTableProps {
  contributors: ContributorSummary[];
  totalCount: number;
  isLoading: boolean;
  /**
   * Which integrations the backend was configured with.
   *
   * The columns for one are built only when it is on. Deciding from the data
   * instead cannot tell a switched-off integration from one that is on and has
   * not collected yet, and it makes a freshly configured install look broken
   * until the first nightly pass.
   */
  capabilities?: IntegrationCapabilities;
}

const formatRate = (rate: number): string => `${rate.toFixed(1)}%`;

const useStyles = makeStyles((theme) => ({
  avatar: { width: 24, height: 24 },
  good: { color: theme.palette.success.main },
  fair: { color: theme.palette.warning.main },
  poor: { color: theme.palette.error.main },
  added: { color: theme.palette.success.main },
  removed: { color: theme.palette.error.main },
  help: { fontSize: "0.85rem", opacity: 0.6 },
  header: { display: "inline-flex", alignItems: "center", gap: 4 },
}));

const rateTone = (rate: number): "good" | "fair" | "poor" => {
  if (rate >= 80) return "good";
  if (rate >= 50) return "fair";
  return "poor";
};

const RateCell = ({ rate }: { rate: number }) => {
  const classes = useStyles();
  const tone = rateTone(rate);
  return (
    <Typography
      variant="body2"
      component="span"
      className={classes[tone]}
      data-tone={tone}
    >
      {formatRate(rate)}
    </Typography>
  );
};

/**
 * A column heading that explains itself.
 *
 * Every rate on this table divides two numbers that are not obvious from the
 * heading — which pull requests, whose pipeline runs — and a reader who guesses
 * wrong reads the column backwards. The explanation belongs next to the number
 * rather than in documentation nobody has open.
 */
const HeaderWithHelp = ({ label, help }: { label: string; help: string }) => {
  const classes = useStyles();

  return (
    <Box component="span" className={classes.header}>
      {label}
      <Tooltip title={help}>
        {/* Two separate things are needed here, and neither works alone.
            `tabIndex` gives the icon a focus event for MUI to open the tooltip
            on — an SVG has none by default, so without it the explanation is
            mouse-only. `titleAccess` is what carries the text to assistive
            technology: `SvgIcon` stamps `aria-hidden` on every icon that lacks
            one, so an `aria-label` would sit on an element screen readers are
            told to skip. */}
        <HelpOutlineIcon className={classes.help} titleAccess={help} tabIndex={0} />
      </Tooltip>
    </Box>
  );
};

const MetricCell = ({ value }: { value: string | number | null }) =>
  value === null ? (
    <EmptyCell />
  ) : (
    <Typography variant="body2">{value}</Typography>
  );

/** Up to two initials, from a display name or an e-mail local part. */
const initialsOf = (displayName: string): string => {
  const words = displayName
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter((word) => word.length > 0);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
};

/**
 * Links a contributor to their catalog user when one matched.
 *
 * The catalog page is the destination rather than the provider profile: it is
 * where ownership, group membership and the rest of the person's entity live.
 * An identity with no matching user — a bot, a service account, a commit from a
 * personal address — stays plain text rather than linking somewhere misleading.
 */
const ContributorName = ({
  contributor,
}: {
  contributor: ContributorSummary;
}) => {
  const entityPath =
    contributor.entityRef === null
      ? null
      : catalogEntityPath(contributor.entityRef);

  if (entityPath !== null) {
    return (
      <Link component={RouterLink} to={entityPath} title="Open in the catalog">
        {contributor.displayName}
      </Link>
    );
  }
  if (contributor.profileUrl !== null) {
    return (
      <Link
        href={contributor.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {contributor.displayName}
      </Link>
    );
  }
  return <Typography variant="body2">{contributor.displayName}</Typography>;
};

/**
 * The identities merged onto one row, so a total nobody can trace back to its
 * sources stays traceable.
 *
 * Only rendered when there is more than one, because a row that says "vcs" is
 * telling the reader nothing they did not already assume.
 */
const MergedIdentities = ({ contributor }: { contributor: ContributorSummary }) => {
  if (contributor.identities.length < 2) return null;

  const sources = [...new Set(contributor.identities.map((identity) => identity.source))];

  return (
    <Tooltip
      title={contributor.identities
        .map((identity) => `${identity.source}: ${identity.sourceKey}`)
        .join("\n")}
    >
      <Typography variant="caption" color="textSecondary" tabIndex={0}>
        {sources.join(" · ")}
      </Typography>
    </Tooltip>
  );
};

const ContributorCell = ({
  contributor,
}: {
  contributor: ContributorSummary;
}) => {
  const classes = useStyles();
  return (
    <Box display="flex" alignItems="center" gridGap={8}>
      <Avatar
        src={contributor.avatarUrl ?? undefined}
        alt={contributor.displayName}
        className={classes.avatar}
      >
        {/* Most directories populate a photo for only some of their people, so
            the fallback is initials rather than a generic silhouette that would
            make every unphotographed contributor look identical. */}
        {initialsOf(contributor.displayName)}
      </Avatar>
      <Box>
        <ContributorName contributor={contributor} />
        <MergedIdentities contributor={contributor} />
      </Box>
    </Box>
  );
};

/**
 * Churn in whatever unit the provider actually reported.
 *
 * GitHub's commit history carries added and deleted lines. Azure DevOps carries
 * added, edited and deleted *files* and exposes no line count anywhere in its
 * REST API, so a lines column against an Azure DevOps fleet reads `0` on every
 * row — which looks like nobody wrote any code rather than like the provider
 * never said. Each row therefore prints its own unit underneath.
 */
const ChurnCell = ({ contributor }: { contributor: ContributorSummary }) => {
  const classes = useStyles();

  if (contributor.churnUnit === "lines") {
    return (
      <Box>
        <Typography variant="body2">
          {contributor.linesOfCode.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          <span className={classes.added}>
            +{contributor.linesAdded.toLocaleString()}
          </span>
          {" / "}
          <span className={classes.removed}>
            -{contributor.linesDeleted.toLocaleString()}
          </span>
        </Typography>
      </Box>
    );
  }

  if (contributor.churnUnit === "files") {
    return (
      <Box>
        <Typography variant="body2">
          {contributor.changedFiles.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          files changed
        </Typography>
      </Box>
    );
  }

  return <EmptyCell />;
};

const columns: ColumnDef<ContributorSummary>[] = [
  {
    accessorKey: "displayName",
    header: "Contributor",
    cell: ({ row }) => <ContributorCell contributor={row.original} />,
    filterFn: "includesString",
  },
  {
    accessorKey: "pullRequestsOpened",
    header: () => (
      <HeaderWithHelp
        label="PRs created"
        help="Pull requests this person opened inside the window. The second figure is how many pull requests of theirs closed as merged in the same window — a pull request opened in one window and merged in the next is counted in each, because neither number is a subset of the other."
      />
    ),
    cell: ({ row }) => (
      <Typography variant="body2" component="span">
        {row.original.pullRequestsOpened.toLocaleString()}{" "}
        <Typography variant="caption" component="span" color="textSecondary">
          / {row.original.pullRequestsMerged.toLocaleString()} merged
        </Typography>
      </Typography>
    ),
    enableColumnFilter: false,
  },
  {
    accessorKey: "reviewsApproved",
    header: () => (
      <HeaderWithHelp
        label="PRs approved"
        help="Other people's pull requests this person reviewed and voted to approve, out of every pull request they reviewed. This is review work done, not their own pull requests."
      />
    ),
    cell: ({ row }) => (
      <Typography variant="body2" component="span">
        {row.original.reviewsApproved.toLocaleString()}{" "}
        <Typography variant="caption" component="span" color="textSecondary">
          / {row.original.reviewsGiven.toLocaleString()} reviewed
        </Typography>
      </Typography>
    ),
    enableColumnFilter: false,
  },
  {
    id: "churn",
    accessorFn: (row) =>
      row.churnUnit === "lines" ? row.linesOfCode : row.changedFiles,
    header: () => (
      <HeaderWithHelp
        label="Code churn"
        help="Lines added minus lines deleted, floored at zero — a window someone spent mostly deleting code is a real contribution, not a negative one. Azure DevOps reports changed files instead and exposes no line count anywhere in its API, so those rows count files. Each row prints its own unit, and the column sorts on whichever it is."
      />
    ),
    cell: ({ row }) => <ChurnCell contributor={row.original} />,
    enableColumnFilter: false,
  },
  {
    accessorKey: "prApprovalRate",
    header: () => (
      <HeaderWithHelp
        label="Approval rate"
        help="Of the pull requests this person reviewed, the share they approved. It describes how someone votes when they review — a low figure means they usually ask for changes — and says nothing about how their own pull requests fare. Nobody reviewing anything reads 0%."
      />
    ),
    cell: ({ getValue }) => <RateCell rate={getValue<number>()} />,
    enableColumnFilter: false,
  },
  {
    accessorKey: "pipelineSuccessRate",
    header: () => (
      <HeaderWithHelp
        label="Pipeline"
        help="Of the pipeline runs requested for this person in the window, the share that succeeded, with the counts beside it. A run is attributed to whoever it was requested for, so a build triggered by their merge counts here even if somebody else pressed the button."
      />
    ),
    cell: ({ row }) => (
      <Box display="flex" alignItems="baseline" gridGap={4}>
        <RateCell rate={row.original.pipelineSuccessRate} />
        <Typography variant="caption" color="textSecondary">
          ({row.original.pipelineRunsSucceeded}/{row.original.pipelineRuns})
        </Typography>
      </Box>
    ),
    enableColumnFilter: false,
  },
  {
    id: "bugs",
    accessorFn: (row) => row.sonarMetrics?.bugs ?? null,
    header: "Bugs",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "codeSmells",
    accessorFn: (row) => row.sonarMetrics?.codeSmells ?? null,
    header: "Smells",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "securityHotspots",
    accessorFn: (row) => row.sonarMetrics?.securityHotspots ?? null,
    header: "Hotspots",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "vulnerabilities",
    accessorFn: (row) => row.sonarMetrics?.vulnerabilities ?? null,
    header: "Vulns",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "coverage",
    accessorFn: (row) => row.sonarMetrics?.coverage ?? null,
    header: "Coverage",
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return <MetricCell value={v !== null ? formatRate(v) : null} />;
    },
    enableColumnFilter: false,
  },
  {
    id: "duplications",
    accessorFn: (row) => row.sonarMetrics?.duplications ?? null,
    header: "Dups",
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return <MetricCell value={v !== null ? formatRate(v) : null} />;
    },
    enableColumnFilter: false,
  },
  {
    id: "technicalDebt",
    accessorFn: (row) => row.sonarMetrics?.technicalDebt ?? null,
    header: "Debt",
    cell: ({ getValue }) => <MetricCell value={getValue<string | null>()} />,
    enableColumnFilter: false,
  },
];

export const ContributorsTable = ({
  contributors,
  totalCount,
  isLoading,
  capabilities = NO_INTEGRATIONS,
}: ContributorsTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "churn", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // The AI columns are gated on the data as well as on the integration, because
  // they are collected separately and opting out of them is a supported way to
  // run WakaTime — a screen of em dashes reads as a fault rather than a choice.
  const showAiColumns = capabilities.wakatime && hasAiMetrics(contributors);
  const allColumns = useMemo(
    () => [
      ...columns,
      ...(capabilities.wakatime ? wakaTimeContributorColumns() : []),
      ...(showAiColumns ? wakaTimeAiColumns() : []),
      ...(capabilities.jira ? jiraContributorColumns() : []),
      ...(capabilities.confluence ? confluenceContributorColumns() : []),
    ],
    [capabilities.wakatime, capabilities.jira, capabilities.confluence, showAiColumns],
  );

  const table = useReactTable({
    data: contributors,
    columns: allColumns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  if (!isLoading && contributors.length === 0) {
    return (
      <Box py={6} textAlign="center">
        <Typography color="textSecondary">No contributors found.</Typography>
      </Box>
    );
  }

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        mb={1}
        gridGap={8}
      >
        <Box display="flex" alignItems="center" gridGap={12}>
          <Typography variant="body2" color="textSecondary">
            {table.getFilteredRowModel().rows.length} of {totalCount}{" "}
            contributors
          </Typography>
        </Box>
        <PaginationControls
          pageIndex={table.getState().pagination.pageIndex}
          pageCount={table.getPageCount()}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onPrevious={() => table.previousPage()}
          onNext={() => table.nextPage()}
        />
      </Box>

      <DataTable table={table} isLoading={isLoading} skeletonRows={5} />
    </>
  );
};
