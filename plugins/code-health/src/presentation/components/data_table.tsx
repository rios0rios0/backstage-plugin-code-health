import { Fragment } from "react";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableContainer from "@material-ui/core/TableContainer";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import TableSortLabel from "@material-ui/core/TableSortLabel";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import type { Column, RowData, Table as TanstackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    filterType?: "select";
    options?: readonly string[];
    /** Present only to satisfy the declaration merge signature. */
    _phantom?: [TData, TValue];
  }
}

const useStyles = makeStyles((theme) => ({
  headerCell: {
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    fontSize: theme.typography.pxToRem(11),
    letterSpacing: "0.05em",
  },
  filterCell: {
    paddingTop: 0,
    paddingBottom: theme.spacing(1),
  },
  bodyCell: {
    whiteSpace: "nowrap",
  },
  skeleton: {
    height: 14,
    width: 64,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
    animation: "$pulse 1.5s ease-in-out infinite",
  },
  "@keyframes pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.4 },
  },
}));

const ColumnFilter = <T,>({ column }: { column: Column<T, unknown> }) => {
  const meta = column.columnDef.meta;
  const value = (column.getFilterValue() as string) ?? "";
  const handleChange = (event: React.ChangeEvent<{ value: unknown }>) =>
    column.setFilterValue((event.target.value as string) || undefined);

  if (meta?.filterType === "select") {
    return (
      <TextField
        select
        size="small"
        fullWidth
        value={value}
        onChange={handleChange}
        SelectProps={{ native: true }}
        inputProps={{ "aria-label": `Filter ${column.id}` }}
      >
        <option value="">All</option>
        {meta.options?.filter(Boolean).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </TextField>
    );
  }

  return (
    <TextField
      size="small"
      fullWidth
      value={value}
      onChange={handleChange}
      placeholder="Filter..."
      inputProps={{ "aria-label": `Filter ${column.id}` }}
    />
  );
};

export interface PaginationControlsProps {
  pageIndex: number;
  pageCount: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export const PaginationControls = ({
  pageIndex,
  pageCount,
  canPreviousPage,
  canNextPage,
  onPrevious,
  onNext,
}: PaginationControlsProps) => {
  if (pageCount <= 1) return null;

  return (
    <Box display="flex" alignItems="center" gridGap={8}>
      <Button size="small" variant="outlined" disabled={!canPreviousPage} onClick={onPrevious}>
        Previous
      </Button>
      <Typography variant="caption" color="textSecondary">
        {pageIndex + 1} / {pageCount}
      </Typography>
      <Button size="small" variant="outlined" disabled={!canNextPage} onClick={onNext}>
        Next
      </Button>
    </Box>
  );
};

interface DataTableProps<T> {
  table: TanstackTable<T>;
  isLoading: boolean;
  skeletonRows?: number;
}

export const DataTable = <T,>({ table, isLoading, skeletonRows = 8 }: DataTableProps<T>) => {
  const classes = useStyles();
  const columnCount = table.getAllLeafColumns().length;

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          {table.getHeaderGroups().map((headerGroup) => (
            <Fragment key={headerGroup.id}>
              <TableRow>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableCell
                      key={header.id}
                      className={classes.headerCell}
                      sortDirection={sorted === false ? false : sorted}
                    >
                      <TableSortLabel
                        active={sorted !== false}
                        direction={sorted === "desc" ? "desc" : "asc"}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableSortLabel>
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow>
                {headerGroup.headers.map((header) => (
                  <TableCell key={header.id} className={classes.filterCell}>
                    {header.column.getCanFilter() ? <ColumnFilter column={header.column} /> : null}
                  </TableCell>
                ))}
              </TableRow>
            </Fragment>
          ))}
        </TableHead>
        <TableBody>
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                <TableRow key={rowIndex} data-testid="loadingRow">
                  {Array.from({ length: columnCount }, (__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <div className={classes.skeleton} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} hover>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={classes.bodyCell}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
