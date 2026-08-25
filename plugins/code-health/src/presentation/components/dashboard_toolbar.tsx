import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import type {
  MonthSelection,
  RangeSelection,
  TimeRange,
} from "../../domain/entities/time_range";
import type { RefreshInterval } from "../hooks/use_auto_refresh";
import { RangePicker } from "./range_picker";

interface DashboardToolbarProps {
  lastFetchedAt: Date | null;
  refreshInterval: RefreshInterval;
  isLoading: boolean;
  /** Only the ranges the backend has ingested enough history to answer for. */
  ranges: readonly TimeRange[];
  /** Only the calendar months with any ingested history, newest first. */
  months: readonly MonthSelection[];
  selection: RangeSelection;
  onRangeChange: (selection: RangeSelection) => void;
  onRefresh: () => void;
  onIntervalChange: (interval: RefreshInterval) => void;
}

const formatTime = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const INTERVAL_OPTIONS: { value: RefreshInterval; label: string }[] = [
  { value: 60000, label: "1 min" },
  { value: 300000, label: "5 min" },
  { value: 900000, label: "15 min" },
  { value: 0, label: "Off" },
];

export const DashboardToolbar = ({
  lastFetchedAt,
  refreshInterval,
  isLoading,
  ranges,
  months,
  selection,
  onRangeChange,
  onRefresh,
  onIntervalChange,
}: DashboardToolbarProps) => (
  <Box display="flex" alignItems="center" gridGap={12} flexWrap="wrap">
    {lastFetchedAt && (
      <Typography variant="caption" color="textSecondary">
        Last updated {formatTime(lastFetchedAt)}
      </Typography>
    )}

    <RangePicker
      ranges={ranges}
      months={months}
      selection={selection}
      onChange={onRangeChange}
    />

    <TextField
      select
      size="small"
      value={refreshInterval}
      onChange={(event) => onIntervalChange(Number(event.target.value) as RefreshInterval)}
      SelectProps={{ native: true }}
      inputProps={{ "aria-label": "Auto refresh interval" }}
    >
      {INTERVAL_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>
          Auto: {label}
        </option>
      ))}
    </TextField>

    <Button
      color="primary"
      variant="contained"
      size="small"
      disabled={isLoading}
      onClick={onRefresh}
    >
      {isLoading ? "Loading..." : "Refresh"}
    </Button>
  </Box>
);
