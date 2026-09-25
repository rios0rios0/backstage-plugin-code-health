import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import { claudeTokenTotal, formatCount, type ContributorSummary } from "@rios0rios0/backstage-plugin-code-health-common";
import type { ColumnDef } from "@tanstack/react-table";
import { EmptyCell } from "../empty_cell";

export const claudeContributorColumns = (): ColumnDef<ContributorSummary>[] => [{
  id: "claudeTokens",
  accessorFn: (row) => row.claudeMetrics === null || row.claudeMetrics === undefined ? -1 : claudeTokenTotal(row.claudeMetrics),
  header: () => <Tooltip title="Claude Code input, output, cache-read and cache-creation tokens across the UTC dates touched by the range. Organization-wide usage, including on repository-scoped views. Informational; excluded from productivity scores."><span>Claude tokens</span></Tooltip>,
  cell: ({ row }) => {
    const metrics = row.original.claudeMetrics;
    if (metrics === null || metrics === undefined) return <EmptyCell />;
    return (<Tooltip title={`${formatCount(metrics.inputTokens)} input / ${formatCount(metrics.outputTokens)} output / ${formatCount(metrics.cacheReadTokens)} cache read / ${formatCount(metrics.cacheCreationTokens)} cache creation`}>
      <Typography variant="body2">{formatCount(claudeTokenTotal(metrics))}</Typography>
    </Tooltip>);
  },
  filterFn: (row, id, value: string) => {
    const count = row.getValue<number>(id);
    return count >= 0 && String(count).includes(value);
  },
}];
