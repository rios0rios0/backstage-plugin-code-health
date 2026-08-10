import { useMemo, useState } from "react";
import Avatar from "@material-ui/core/Avatar";
import Box from "@material-ui/core/Box";
import Link from "@material-ui/core/Link";
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
import type { ContributorSummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { formatDuration } from "@rios0rios0/backstage-plugin-code-health-common";
import { DataTable, PaginationControls } from "./data_table";
import { EmptyCell } from "./empty_cell";

interface ContributorsTableProps {
  contributors: ContributorSummary[];
  totalCount: number;
  isLoading: boolean;
}

const formatRate = (rate: number): string => `${rate.toFixed(1)}%`;

const useStyles = makeStyles((theme) => ({
  avatar: { width: 24, height: 24 },
  good: { color: theme.palette.success.main },
  fair: { color: theme.palette.warning.main },
  poor: { color: theme.palette.error.main },
  added: { color: theme.palette.success.main },
  removed: { color: theme.palette.error.main },
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
    <Typography variant="body2" component="span" className={classes[tone]} data-tone={tone}>
      {formatRate(rate)}
    </Typography>
  );
};

const MetricCell = ({ value }: { value: string | number | null }) =>
  value === null ? <EmptyCell /> : <Typography variant="body2">{value}</Typography>;

const ContributorCell = ({ contributor }: { contributor: ContributorSummary }) => {
  const classes = useStyles();
  return (
    <Box display="flex" alignItems="center" gridGap={8}>
      <Avatar
        src={contributor.avatarUrl ?? undefined}
        alt={contributor.displayName}
        className={classes.avatar}
      />
      {contributor.profileUrl === null ? (
        <Typography variant="body2">{contributor.displayName}</Typography>
      ) : (
        <Link href={contributor.profileUrl} target="_blank" rel="noopener noreferrer">
          {contributor.displayName}
        </Link>
      )}
    </Box>
  );
};

const LinesOfCodeCell = ({ contributor }: { contributor: ContributorSummary }) => {
  const classes = useStyles();
  return (
    <Box>
      <Typography variant="body2">{contributor.linesOfCode.toLocaleString()}</Typography>
      <Typography variant="caption" color="textSecondary">
        <span className={classes.added}>+{contributor.linesAdded.toLocaleString()}</span>
        {" / "}
        <span className={classes.removed}>-{contributor.linesDeleted.toLocaleString()}</span>
      </Typography>
    </Box>
  );
};

const columns: ColumnDef<ContributorSummary>[] = [
  {
    accessorKey: "displayName",
    header: "Contributor",
    cell: ({ row }) => <ContributorCell contributor={row.original} />,
    filterFn: "includesString",
  },
  {
    accessorKey: "reviewsApproved",
    header: "Approved PRs",
    cell: ({ row }) => (
      <Typography variant="body2" component="span">
        {row.original.reviewsApproved}{" "}
        <Typography variant="caption" component="span" color="textSecondary">
          / {row.original.reviewsGiven}
        </Typography>
      </Typography>
    ),
    enableColumnFilter: false,
  },
  {
    accessorKey: "linesOfCode",
    header: "Lines of Code",
    cell: ({ row }) => <LinesOfCodeCell contributor={row.original} />,
    enableColumnFilter: false,
  },
  {
    accessorKey: "prApprovalRate",
    header: "Approval Rate",
    cell: ({ getValue }) => <RateCell rate={getValue<number>()} />,
    enableColumnFilter: false,
  },
  {
    accessorKey: "pipelineSuccessRate",
    header: "Pipeline",
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

const wakaTimeColumns: ColumnDef<ContributorSummary>[] = [
  {
    id: "totalTime",
    accessorFn: (row) => row.wakaTimeMetrics?.totalSeconds ?? 0,
    header: "Total Time (30d)",
    cell: ({ row }) => {
      const metrics = row.original.wakaTimeMetrics;
      return <MetricCell value={metrics ? formatDuration(metrics.totalSeconds) : null} />;
    },
    enableColumnFilter: false,
  },
  {
    id: "dailyAverage",
    accessorFn: (row) => row.wakaTimeMetrics?.dailyAverageSeconds ?? 0,
    header: "Daily Avg",
    cell: ({ row }) => {
      const metrics = row.original.wakaTimeMetrics;
      return <MetricCell value={metrics ? formatDuration(metrics.dailyAverageSeconds) : null} />;
    },
    enableColumnFilter: false,
  },
];

export const ContributorsTable = ({
  contributors,
  totalCount,
  isLoading,
}: ContributorsTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: "linesOfCode", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const hasWakaTime = contributors.some((c) => c.wakaTimeMetrics !== null);
  const allColumns = useMemo(
    () => (hasWakaTime ? [...columns, ...wakaTimeColumns] : columns),
    [hasWakaTime],
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
            {table.getFilteredRowModel().rows.length} of {totalCount} contributors
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
