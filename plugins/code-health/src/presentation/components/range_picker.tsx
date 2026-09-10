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
} from "../../domain/entities/time_range";
import {
  monthLabel,
  sameMonth,
  selectionFromKey,
  selectionKey,
  shiftMonth,
} from "../../domain/entities/time_range";

const useStyles = makeStyles((theme) => ({
  group: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
  },
  select: { minWidth: 172 },
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
 * One control, not two — a mode switch beside a range dropdown would let the
 * two disagree, a month showing while the dropdown still read "last 7 days".
 *
 * Every month the backfill has reached is in that one list, by name and newest
 * first. They used to hide behind a "By month…" entry that revealed a month and
 * a year stepper, so the list somebody opened looking for September never
 * contained the word September and there was no way to tell from it that a
 * month could be picked at all. Naming them makes it one click and retires the
 * two steppers, which were the only other thing that could disagree with the
 * list about which month is showing.
 *
 * The arrows stay. Stepping to the month before the one on screen is the
 * comparison people make most, and it is worth not making them reopen a list of
 * a year's worth of months to do it. Both stop at the ends of what has been
 * ingested, so the picker cannot ask for a period that would come back empty.
 */
export const RangePicker = ({
  ranges,
  months,
  selection,
  onChange,
}: RangePickerProps) => {
  const classes = useStyles();

  const active = selection.kind === "month" ? selection.month : undefined;
  const [newest] = months;
  const oldest = months[months.length - 1];

  const canStepBack =
    active !== undefined && oldest !== undefined && !sameMonth(active, oldest);
  const canStepForward =
    active !== undefined && newest !== undefined && !sameMonth(active, newest);

  const onSelect = (key: string) => {
    const next = selectionFromKey(key);
    // A browser handed a value none of its options carry reports the empty
    // string back. Staying put is better than querying for nobody's window.
    if (next !== null) onChange(next);
  };

  return (
    <Box className={classes.group}>
      <TextField
        select
        size="small"
        className={classes.select}
        value={selectionKey(selection)}
        onChange={(event) => onSelect(event.target.value as string)}
        SelectProps={{ native: true }}
        inputProps={{ "aria-label": "Time range", "data-test-subj": "timeRangeSelect" }}
      >
        <optgroup label="Rolling">
          {ranges.map((range) => (
            <option key={range.id} value={selectionKey({ kind: "preset", id: range.id })}>
              {range.label}
            </option>
          ))}
        </optgroup>
        {/* Omitted rather than left empty: a group heading with nothing under
            it reads as an integration that broke, and a brand new install has
            no coverage to offer a month from yet. */}
        {months.length > 0 ? (
          <optgroup label="Calendar months">
            {months.map((month) => {
              const key = selectionKey({ kind: "month", month });
              return (
                <option key={key} value={key}>
                  {monthLabel(month)}
                </option>
              );
            })}
          </optgroup>
        ) : null}
      </TextField>

      {active !== undefined ? (
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
                onClick={() => onChange({ kind: "month", month: shiftMonth(active, -1) })}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Next month">
            <span>
              <IconButton
                size="small"
                className={classes.step}
                aria-label="Next month"
                disabled={!canStepForward}
                onClick={() => onChange({ kind: "month", month: shiftMonth(active, 1) })}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Box
            component="span"
            // Announced rather than drawn: the list already names the month,
            // but an arrow changes it without moving focus, so a screen reader
            // is told nothing at all unless it is told here.
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
