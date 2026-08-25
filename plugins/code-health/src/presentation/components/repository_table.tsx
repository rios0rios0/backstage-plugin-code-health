import { useCallback, useMemo, useState } from "react";
import Box from "@material-ui/core/Box";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Link from "@material-ui/core/Link";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import type { ColumnDef, ColumnFiltersState, SortingState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { RepositorySummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { catalogEntityPath } from "@rios0rios0/backstage-plugin-code-health-common";
import { Link as RouterLink } from "react-router-dom";
import { BadgeStatusCell } from "./badge_status_cell";
import { ComplianceBadge } from "./compliance_badge";
import { DataTable, PaginationControls } from "./data_table";
import { ApiExposureBadge } from "./api_exposure_badge";
import { DocumentationBadge } from "./documentation_badge";
import { EmptyCell } from "./empty_cell";
import { StateChip } from "./state_chip";
import { StatusBadge } from "./status_badge";

interface RepositoryTableProps {
  repositories: RepositorySummary[];
  totalCount: number;
  isLoading: boolean;
}

const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
};

const useBranchStyles = makeStyles((theme) => ({
  anchor: { position: "relative" },
  overlay: { position: "fixed", inset: 0, zIndex: theme.zIndex.modal - 1 },
  popup: {
    position: "absolute",
    left: 0,
    top: "100%",
    zIndex: theme.zIndex.modal,
    marginTop: theme.spacing(0.5),
    width: 224,
    maxHeight: 240,
    overflowY: "auto",
  },
  list: { listStyle: "none", margin: 0, padding: theme.spacing(0.5, 0) },
  item: { padding: theme.spacing(0.5, 1.5) },
  monospace: { fontFamily: "monospace" },
}));

const BranchesCell = ({
  branches,
  defaultBranch,
}: {
  branches: readonly string[];
  defaultBranch: string;
}) => {
  const classes = useBranchStyles();
  const [open, setOpen] = useState(false);
  const nonDefault = branches.filter((b) => b !== defaultBranch);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return (
    <div className={classes.anchor}>
      <StateChip
        tone="neutral"
        label={String(nonDefault.length)}
        onClick={toggle}
        ariaExpanded={open}
      />
      {open && (
        <>
          <div
            data-testid="branches-overlay"
            className={classes.overlay}
            onClick={toggle}
            aria-hidden="true"
          />
          <Paper elevation={8} className={classes.popup} role="menu" aria-label="Branches">
            {nonDefault.length === 0 ? (
              <Box p={1.5}>
                <Typography variant="caption" color="textSecondary">
                  No extra branches
                </Typography>
              </Box>
            ) : (
              <ul className={classes.list}>
                {nonDefault.map((branch) => (
                  <li key={branch} className={classes.item}>
                    <Typography variant="caption">{branch}</Typography>
                  </li>
                ))}
              </ul>
            )}
          </Paper>
        </>
      )}
    </div>
  );
};

const DefaultBranchCell = ({ branch }: { branch: string }) => {
  const classes = useBranchStyles();
  const isNonStandard = branch !== "main";

  if (isNonStandard) {
    return <StateChip tone="warning" label={branch} title="Default branch is not 'main'" />;
  }

  return (
    <Typography variant="caption" className={classes.monospace}>
      {branch}
    </Typography>
  );
};

const MetricCell = ({ value }: { value: string | number | null }) =>
  value === null ? <EmptyCell /> : <Typography variant="body2">{value}</Typography>;

const RepositoryNameCell = ({ repository }: { repository: RepositorySummary }) => {
  // The name goes to the catalog entity rather than to the provider: that page is
  // where a reader can act on the repository — owner, docs, dependencies, the
  // other entity tabs — and it carries the provider URL itself through its source
  // location, so nothing is lost by not linking there twice.
  const entityPath = catalogEntityPath(repository.entityRef);

  return (
    <Box>
      <Box display="flex" alignItems="center" gridGap={8}>
        {entityPath === null ? (
          // A reference the catalog cannot address degrades to plain text rather
          // than to a link that would 404.
          <Typography variant="body2">{repository.fullName}</Typography>
        ) : (
          <Link component={RouterLink} to={entityPath} title="Open in the catalog">
            {repository.fullName}
          </Link>
        )}
        {repository.isArchived && <StateChip tone="warning" label="archived" />}
        {repository.isFork && <StateChip tone="info" label="fork" />}
      </Box>
      {repository.description && (
        <Typography variant="caption" color="textSecondary" noWrap component="p">
          {repository.description}
        </Typography>
      )}
    </Box>
  );
};

const columns: ColumnDef<RepositorySummary>[] = [
  {
    accessorKey: "fullName",
    header: "Repository",
    cell: ({ row }) => <RepositoryNameCell repository={row.original} />,
    filterFn: "includesString",
  },
  {
    accessorKey: "defaultBranch",
    header: "Default Branch",
    cell: ({ getValue }) => <DefaultBranchCell branch={getValue<string>()} />,
    filterFn: "includesString",
  },
  {
    id: "branches",
    accessorFn: (row) => row.branches.filter((branch) => branch !== row.defaultBranch).length,
    header: "Branches",
    cell: ({ row }) => (
      <BranchesCell branches={row.original.branches} defaultBranch={row.original.defaultBranch} />
    ),
    enableColumnFilter: false,
  },
  {
    id: "ciStatus",
    accessorFn: (row) => row.ciStatus?.state ?? "NONE",
    header: "CI Status",
    cell: ({ row }) => <StatusBadge state={row.original.ciStatus?.state ?? null} />,
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue || filterValue === "all") return true;
      const state = row.original.ciStatus?.state ?? null;
      if (filterValue === "passing") return state === "SUCCESS";
      if (filterValue === "failing") return state !== null && state !== "SUCCESS";
      if (filterValue === "no-ci") return state === null;
      return true;
    },
    meta: { filterType: "select", options: ["all", "passing", "failing", "no-ci"] },
  },
  {
    id: "compliance",
    accessorFn: (row) => row.complianceStatus?.color ?? "none",
    header: "Compliance",
    cell: ({ row }) => <ComplianceBadge status={row.original.complianceStatus} />,
    meta: { filterType: "select", options: ["", "green", "yellow", "red"] },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.original.complianceStatus?.color ?? "none") === filterValue;
    },
  },
  {
    id: "badges",
    accessorFn: (row) => row.badgeStatus?.color ?? "none",
    header: "Badges",
    cell: ({ row }) => <BadgeStatusCell status={row.original.badgeStatus} />,
    meta: { filterType: "select", options: ["", "green", "yellow"] },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.original.badgeStatus?.color ?? "none") === filterValue;
    },
  },
  {
    id: "documentation",
    accessorFn: (row) => row.documentation?.state ?? "unknown",
    header: "Docs",
    cell: ({ row }) => <DocumentationBadge status={row.original.documentation} />,
    meta: {
      filterType: "select",
      options: ["", "documented", "unpublished", "missing", "not-expected"],
    },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.original.documentation?.state ?? "unknown") === filterValue;
    },
  },
  {
    id: "apiExposure",
    accessorFn: (row) => row.apiExposure?.state ?? "unknown",
    header: "API",
    cell: ({ row }) => <ApiExposureBadge exposure={row.original.apiExposure} />,
    meta: {
      filterType: "select",
      options: ["", "declared", "candidate", "expected", "none"],
    },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.original.apiExposure?.state ?? "unknown") === filterValue;
    },
  },
  {
    accessorKey: "primaryLanguage",
    header: "Language",
    cell: ({ getValue }) => {
      const lang = getValue<string | null>();
      return lang ? <StateChip tone="info" label={lang} /> : <EmptyCell />;
    },
    filterFn: "includesString",
  },
  {
    id: "latestRelease",
    accessorFn: (row) => row.latestRelease?.tagName ?? "",
    header: "Release",
    cell: ({ row }) => {
      const release = row.original.latestRelease;
      if (!release) return <EmptyCell />;
      return (
        <Link href={release.url} target="_blank" rel="noopener noreferrer">
          <Typography variant="caption" component="span" style={{ fontFamily: "monospace" }}>
            {release.tagName}
          </Typography>{" "}
          <Typography variant="caption" component="span" color="textSecondary">
            {formatRelativeDate(release.publishedAt)}
          </Typography>
        </Link>
      );
    },
    filterFn: "includesString",
  },
  {
    id: "latestTag",
    accessorFn: (row) => row.latestTag?.name ?? "",
    header: "Tag",
    cell: ({ row }) => {
      const tag = row.original.latestTag;
      return tag ? (
        <Typography variant="caption" style={{ fontFamily: "monospace" }}>
          {tag.name}
        </Typography>
      ) : (
        <EmptyCell />
      );
    },
    filterFn: "includesString",
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ getValue }) => (
      <Typography variant="caption" color="textSecondary">
        {formatRelativeDate(getValue<string>())}
      </Typography>
    ),
    enableColumnFilter: false,
  },
  {
    accessorKey: "visibility",
    header: "Visibility",
    cell: ({ getValue }) =>
      getValue<string>() === "PRIVATE" ? (
        <StateChip tone="neutral" label="private" />
      ) : (
        <Typography variant="caption" color="textSecondary">
          public
        </Typography>
      ),
    meta: { filterType: "select", options: ["", "PUBLIC", "PRIVATE"] },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return row.original.visibility === filterValue;
    },
  },
  {
    id: "qualityGate",
    accessorFn: (row) => row.sonarMetrics?.qualityGateStatus ?? "NONE",
    header: "Quality Gate",
    cell: ({ row }) => {
      const status = row.original.sonarMetrics?.qualityGateStatus;
      if (!status || status === "NONE") return <EmptyCell />;
      return status === "OK" ? (
        <StateChip tone="success" label="Passed" />
      ) : (
        <StateChip tone="error" label="Failed" />
      );
    },
    meta: { filterType: "select", options: ["", "OK", "ERROR"] },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.original.sonarMetrics?.qualityGateStatus ?? "NONE") === filterValue;
    },
  },
  {
    id: "sonarBugs",
    accessorFn: (row) => row.sonarMetrics?.bugs ?? null,
    header: "Bugs",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "sonarSmells",
    accessorFn: (row) => row.sonarMetrics?.codeSmells ?? null,
    header: "Smells",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "sonarVulns",
    accessorFn: (row) => row.sonarMetrics?.vulnerabilities ?? null,
    header: "Vulns",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "sonarHotspots",
    accessorFn: (row) => row.sonarMetrics?.securityHotspots ?? null,
    header: "Hotspots",
    cell: ({ getValue }) => <MetricCell value={getValue<number | null>()} />,
    enableColumnFilter: false,
  },
  {
    id: "sonarCoverage",
    accessorFn: (row) => row.sonarMetrics?.coverage ?? null,
    header: "Coverage",
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return <MetricCell value={v !== null ? `${v.toFixed(1)}%` : null} />;
    },
    enableColumnFilter: false,
  },
  {
    id: "sonarDups",
    accessorFn: (row) => row.sonarMetrics?.duplications ?? null,
    header: "Dups",
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return <MetricCell value={v !== null ? `${v.toFixed(1)}%` : null} />;
    },
    enableColumnFilter: false,
  },
  {
    id: "sonarDebt",
    accessorFn: (row) => row.sonarMetrics?.technicalDebt ?? null,
    header: "Debt",
    cell: ({ getValue }) => <MetricCell value={getValue<string | null>()} />,
    enableColumnFilter: false,
  },
];

export const RepositoryTable = ({
  repositories,
  totalCount,
  isLoading,
}: RepositoryTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: "fullName", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showForks, setShowForks] = useState(false);

  const filteredData = useMemo(() => {
    let data = repositories;
    if (!showArchived) data = data.filter((r) => !r.isArchived);
    if (!showForks) data = data.filter((r) => !r.isFork);
    return data;
  }, [repositories, showArchived, showForks]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  if (!isLoading && repositories.length === 0) {
    return (
      <Box py={6} textAlign="center">
        <Typography color="textSecondary">No repositories found.</Typography>
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
        <Box display="flex" alignItems="center" gridGap={16}>
          <Typography variant="body2" color="textSecondary">
            {table.getFilteredRowModel().rows.length} of {totalCount} repositories
          </Typography>
          <FormControlLabel
            label="Archived"
            control={
              <Checkbox
                size="small"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            }
          />
          <FormControlLabel
            label="Forks"
            control={
              <Checkbox
                size="small"
                checked={showForks}
                onChange={(e) => setShowForks(e.target.checked)}
              />
            }
          />
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

      <DataTable table={table} isLoading={isLoading} skeletonRows={8} />
    </>
  );
};
