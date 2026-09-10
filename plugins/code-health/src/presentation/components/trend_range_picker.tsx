import Box from "@material-ui/core/Box";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { TREND_MONTHS } from "@rios0rios0/backstage-plugin-code-health-common";

export interface TrendRangePickerProps {
  readonly months: number;
  /** Only the counts the backend has ingested enough history to answer for. */
  readonly offered: readonly number[];
  readonly onChange: (months: number) => void;
}

export const trendRangeLabel = (months: number): string =>
  months === 1 ? "Last month" : `Last ${months} months`;

/**
 * How far back a detail page looks: one to six months.
 *
 * Months rather than the tables' rolling ranges, because a trend is read in
 * months — "did it get better this quarter" — and a picker offering seven days
 * would draw a chart with one point on it. Counts the backfill has not reached
 * are left off the list, and the caption says why the list is short, so a
 * fresh install reads as "still collecting" rather than as a broken control.
 */
export const TrendRangePicker = ({ months, offered, onChange }: TrendRangePickerProps) => (
  <Box display="flex" alignItems="center" gridGap={12} flexWrap="wrap">
    <TextField
      select
      size="small"
      value={months}
      onChange={(event) => onChange(Number(event.target.value))}
      SelectProps={{ native: true }}
      inputProps={{ "aria-label": "Trend range" }}
    >
      {offered.map((count) => (
        <option key={count} value={count}>
          {trendRangeLabel(count)}
        </option>
      ))}
    </TextField>
    {offered.length < TREND_MONTHS.length ? (
      <Typography variant="caption" color="textSecondary">
        Wider ranges unlock as the history is collected.
      </Typography>
    ) : null}
  </Box>
);
