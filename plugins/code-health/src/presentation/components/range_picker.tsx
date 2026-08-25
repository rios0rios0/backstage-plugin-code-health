import Box from "@material-ui/core/Box";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import Tooltip from "@material-ui/core/Tooltip";
import { makeStyles } from "@material-ui/core/styles";
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import type {
  MonthSelection,
  RangeSelection,
  TimeRange,
  TimeRangeId,
} from "../../domain/entities/time_range";
import {
  availableYears,
  monthLabel,
  monthName,
  monthsInYear,
  sameMonth,
  shiftMonth,
} from "../../domain/entities/time_range";

/** The value the preset select carries for "pick a specific month". */
const MONTH_MODE = "__month__";

const useStyles = makeStyles((theme) => ({
  group: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
  },
  preset: { minWidth: 148 },
  month: { minWidth: 124 },
  year: { minWidth: 88 },
  step: { padding: theme.spacing(0.5) },
}));

export interface RangePickerProps {
  readonly ranges: readonly TimeRange[];
  readonly months: readonly MonthSelection[];
  readonly selection: RangeSelection;
  readonly onChange: (selection: RangeSelection) => void;
}

/**
 * Picks either a rolling range or one calendar month.
 *
 * One control, not two. A separate "mode" switch beside a range dropdown would
 * let the two disagree — a month showing while the dropdown still reads "last 7
 * days" — so the month lives at the bottom of the same list, and choosing it is
 * what reveals the month and year steppers.
 *
 * Every month with history is reachable in two clicks at most: the arrows step
 * one month at a time for the common "and the month before that", and the two
 * dropdowns jump straight to any month of any year for everything else. Both
 * stop at the ends of what the backend has ingested, so the picker cannot ask
 * for a period that would come back empty.
 */
export const RangePicker = ({
  ranges,
  months,
  selection,
  onChange,
}: RangePickerProps) => {
  const classes = useStyles();

  const isMonthMode = selection.kind === "month";
  const newest = months[0];
  const oldest = months[months.length - 1];
  const active = isMonthMode ? selection.month : newest;

  const years = availableYears(months);
  const monthsThisYear = active === undefined ? [] : monthsInYear(months, active.year);

  const canStepBack =
    active !== undefined && oldest !== undefined && !sameMonth(active, oldest);
  const canStepForward =
    active !== undefined && newest !== undefined && !sameMonth(active, newest);

  const selectMonth = (month: MonthSelection) => onChange({ kind: "month", month });

  const onPresetChange = (value: string) => {
    if (value !== MONTH_MODE) {
      onChange({ kind: "preset", id: value as TimeRangeId });
      return;
    }
    // Entering month mode lands on the newest month rather than on an arbitrary
    // one, because that is the month the rolling ranges were already describing.
    if (newest !== undefined) selectMonth(newest);
  };

  const onYearChange = (year: number) => {
    const candidates = monthsInYear(months, year);
    if (candidates.length === 0 || active === undefined) return;
    // Keeping the month across a year change is what makes "the same month last
    // year" one click. When that month has no history in the new year, the
    // newest month of that year is the nearest thing that does.
    const kept = candidates.find((month) => month.month === active.month);
    selectMonth(kept ?? candidates[0]);
  };

  return (
    <Box className={classes.group}>
      <TextField
        select
        size="small"
        className={classes.preset}
        value={isMonthMode ? MONTH_MODE : selection.id}
        onChange={(event) => onPresetChange(event.target.value as string)}
        SelectProps={{ native: true }}
        inputProps={{ "aria-label": "Time range", "data-test-subj": "timeRangeSelect" }}
      >
        <optgroup label="Rolling">
          {ranges.map((range) => (
            <option key={range.id} value={range.id}>
              {range.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Calendar">
          <option value={MONTH_MODE}>By month…</option>
        </optgroup>
      </TextField>

      {isMonthMode && active !== undefined ? (
        <>
          <Tooltip title="Previous month">
            {/* A disabled button drops its own events, so the tooltip needs a
                wrapper it can still hear at the ends of the range. */}
            <span>
              <IconButton
                size="small"
                className={classes.step}
                aria-label="Previous month"
                disabled={!canStepBack}
                onClick={() => selectMonth(shiftMonth(active, -1))}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <TextField
            select
            size="small"
            className={classes.month}
            value={active.month}
            onChange={(event) =>
              selectMonth({ year: active.year, month: Number(event.target.value) })
            }
            SelectProps={{ native: true }}
            inputProps={{ "aria-label": "Month", "data-test-subj": "monthSelect" }}
          >
            {Array.from({ length: 12 }, (_unused, index) => index + 1).map((month) => (
              <option
                key={month}
                value={month}
                // Months outside the ingested history stay visible but
                // unselectable, so the gap reads as "not collected yet" rather
                // than as a list that mysteriously starts in April.
                disabled={!monthsThisYear.some((candidate) => candidate.month === month)}
              >
                {monthName(month)}
              </option>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            className={classes.year}
            value={active.year}
            onChange={(event) => onYearChange(Number(event.target.value))}
            SelectProps={{ native: true }}
            inputProps={{ "aria-label": "Year", "data-test-subj": "yearSelect" }}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </TextField>

          <Tooltip title="Next month">
            <span>
              <IconButton
                size="small"
                className={classes.step}
                aria-label="Next month"
                disabled={!canStepForward}
                onClick={() => selectMonth(shiftMonth(active, 1))}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Box
            component="span"
            // Announced rather than drawn: the two dropdowns already say which
            // month is selected, but a screen reader moving through them one at
            // a time never hears them together.
            aria-live="polite"
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
          >
            {monthLabel(active)}
          </Box>
        </>
      ) : null}
    </Box>
  );
};
