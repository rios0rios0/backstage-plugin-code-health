import { useMemo, useState } from "react";
import Avatar from "@material-ui/core/Avatar";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Link from "@material-ui/core/Link";
import TextField from "@material-ui/core/TextField";
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
import type { Contributor } from "../../domain/entities/contributor";
import { formatDuration } from "../../domain/entities/wakatime_metrics";
import { DataTable, PaginationControls } from "./data_table";
import { EmptyCell } from "./empty_cell";

interface ContributorsTableProps {
  contributors: Contributor[];
  totalCount: number;
  isLoading: boolean;
  onDateRangeApply: (dateFrom: string | null, dateTo: string | null) => void;
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

const ContributorCell = ({ contributor }: { contributor: Contributor }) => {
  const classes = useStyles();
  return (
    <Box display="flex" alignItems="center" gridGap={8}>
      <Avatar
        src={contributor.avatarUrl}
        alt={contributor.username}
        className={classes.avatar}
      />
      <Link href={contributor.profileUrl} target="_blank" rel="noopener noreferrer">
        {contributor.username}
      </Link>
    </Box>
  );
};

const LinesOfCodeCell = ({ contributor }: { contributor: Contributor }) => {
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

const columns: ColumnDef<Contributor>[] = [
  {
    accessorKey: "username",
    header: "Contributor",
    cell: ({ row }) => <ContributorCell contributor={row.original} />,
    filterFn: "includesString",
  },
  {
    accessorKey: "approvedPRs",
    header: "Approved PRs",
    cell: ({ row }) => (
      <Typography variant="body2" component="span">
        {row.original.approvedPRs}{" "}
        <Typography variant="caption" component="span" color="textSecondary">
          / {row.original.totalPRs}
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
          ({row.original.successfulPipelineRuns}/{row.original.totalPipelineRuns})
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

const wakaTimeColumns: ColumnDef<Contributor>[] = [
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
  onDateRangeApply,
}: ContributorsTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: "linesOfCode", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
          <TextField
            type="date"
            size="small"
            inputProps={{ "aria-label": "Date from" }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Typography variant="caption" color="textSecondary">
            to
          </Typography>
          <TextField
            type="date"
            size="small"
            inputProps={{ "aria-label": "Date to" }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Button
            size="small"
            color="primary"
            variant="contained"
            onClick={() => onDateRangeApply(dateFrom || null, dateTo || null)}
          >
            Apply
          </Button>
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
