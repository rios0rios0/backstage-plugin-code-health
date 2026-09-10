import { fireEvent, render, screen } from "@testing-library/react";
import type {
  MonthSelection,
  RangeSelection,
  TimeRangeId,
} from "../../../src/domain/entities/time_range";
import { TIME_RANGES } from "../../../src/domain/entities/time_range";
import { RangePicker } from "../../../src/presentation/components/range_picker";

const MONTHS: MonthSelection[] = [
  { year: 2026, month: 8 },
  { year: 2026, month: 7 },
  { year: 2026, month: 6 },
  { year: 2025, month: 12 },
];

const renderPicker = (
  selection: RangeSelection,
  onChange = jest.fn(),
  months: MonthSelection[] = MONTHS,
) => {
  render(
    <RangePicker
      ranges={TIME_RANGES}
      months={months}
      selection={selection}
      onChange={onChange}
    />,
  );
  return onChange;
};

const preset = (id: TimeRangeId): RangeSelection => ({ kind: "preset", id });

const rangeSelect = () => screen.getByLabelText("Time range");

/** Every option in the one dropdown, in the order a reader sees them. */
const optionLabels = () =>
  screen.getAllByRole("option").map((option) => option.textContent);

describe("RangePicker", () => {
  it("should offer every rolling range it was given", () => {
    // given / when
    renderPicker(preset("day"));

    // then
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Last 365 days")).toBeInTheDocument();
  });

  it("should name every month with history, newest first, in the same list", () => {
    // given / when
    renderPicker(preset("day"));

    // then
    // The months used to hide behind a "By month…" entry that revealed two
    // steppers, so the list somebody opened looking for a month never held the
    // name of one and gave no sign that a month could be picked at all.
    expect(optionLabels().slice(TIME_RANGES.length)).toEqual([
      "August 2026",
      "July 2026",
      "June 2026",
      "December 2025",
    ]);
  });

  it("should report a rolling range a user picked", () => {
    // given
    const onChange = renderPicker(preset("day"));

    // when
    fireEvent.change(rangeSelect(), { target: { value: "preset:week" } });

    // then
    expect(onChange).toHaveBeenCalledWith({ kind: "preset", id: "week" });
  });

  it("should report a month a user picked straight out of the list", () => {
    // given
    const onChange = renderPicker(preset("day"));

    // when
    fireEvent.change(rangeSelect(), { target: { value: "month:2026-6" } });

    // then
    // One click, rather than a mode switch followed by two dropdowns.
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2026, month: 6 } });
  });

  it("should show the selected month as the value of the same control", () => {
    // given / when
    renderPicker({ kind: "month", month: { year: 2026, month: 7 } });

    // then
    // One control, not two: nothing else on screen can disagree with it about
    // which month is showing.
    expect(rangeSelect()).toHaveValue("month:2026-7");
  });

  it("should hide the month arrows while a rolling range is selected", () => {
    // given / when
    renderPicker(preset("day"));

    // then
    expect(screen.queryByLabelText("Previous month")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next month")).not.toBeInTheDocument();
  });

  it("should step back one month", () => {
    // given
    const onChange = renderPicker({ kind: "month", month: { year: 2026, month: 7 } });

    // when
    fireEvent.click(screen.getByLabelText("Previous month"));

    // then
    // The arrows survive the new list because "and the month before that" is
    // the comparison people make most, and reopening a year of months to make
    // it is a worse deal than one click.
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2026, month: 6 } });
  });

  it("should step forward one month", () => {
    // given
    const onChange = renderPicker({ kind: "month", month: { year: 2026, month: 7 } });

    // when
    fireEvent.click(screen.getByLabelText("Next month"));

    // then
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2026, month: 8 } });
  });

  it("should refuse to step past the newest month with history", () => {
    // given / when
    renderPicker({ kind: "month", month: { year: 2026, month: 8 } });

    // then
    // The picker cannot ask for a period the backend would answer emptily.
    expect(screen.getByLabelText("Next month")).toBeDisabled();
  });

  it("should refuse to step past the oldest month with history", () => {
    // given / when
    renderPicker({ kind: "month", month: { year: 2025, month: 12 } });

    // then
    expect(screen.getByLabelText("Previous month")).toBeDisabled();
  });

  it("should announce the selected month for a screen reader", () => {
    // given / when
    renderPicker({ kind: "month", month: { year: 2026, month: 7 } });

    // then
    // An arrow changes the month without moving focus, so a screen reader is
    // told nothing at all unless it is told here.
    expect(
      screen.getByText("July 2026", { selector: "[aria-live]" }),
    ).toBeInTheDocument();
  });

  it("should cope with no months being offered at all", () => {
    // given / when
    renderPicker(preset("day"), jest.fn(), []);

    // then
    // Coverage is empty on a brand new install, and a group heading with
    // nothing under it reads as an integration that broke.
    expect(optionLabels()).toHaveLength(TIME_RANGES.length);
  });

  it("should ignore a value that encodes no selection", () => {
    // given
    const onChange = renderPicker(preset("day"));

    // when
    fireEvent.change(rangeSelect(), { target: { value: "not-a-selection" } });

    // then
    // A browser reports the empty string for a value none of its options
    // carry; staying put beats querying for nobody's window.
    expect(onChange).not.toHaveBeenCalled();
  });
});
