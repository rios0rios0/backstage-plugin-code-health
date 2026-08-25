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

describe("RangePicker", () => {
  it("should offer every rolling range it was given", () => {
    // given / when
    renderPicker(preset("day"));

    // then
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Last 365 days")).toBeInTheDocument();
  });

  it("should report a rolling range a user picked", () => {
    // given
    const onChange = renderPicker(preset("day"));

    // when
    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "week" } });

    // then
    expect(onChange).toHaveBeenCalledWith({ kind: "preset", id: "week" });
  });

  it("should hide the month steppers while a rolling range is selected", () => {
    // given / when
    renderPicker(preset("day"));

    // then
    // One control, not two: a mode switch beside the dropdown would let the two
    // disagree about what is being shown.
    expect(screen.queryByLabelText("Month")).not.toBeInTheDocument();
  });

  it("should land on the newest month when a user switches to month mode", () => {
    // given
    const onChange = renderPicker(preset("day"));

    // when
    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "__month__" } });

    // then
    // That is the month the rolling ranges were already describing, so nothing
    // about the view jumps.
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2026, month: 8 } });
  });

  it("should show the month and year of the selection", () => {
    // given / when
    renderPicker({ kind: "month", month: { year: 2026, month: 7 } });

    // then
    expect(screen.getByLabelText("Month")).toHaveValue("7");
    expect(screen.getByLabelText("Year")).toHaveValue("2026");
  });

  it("should step back one month", () => {
    // given
    const onChange = renderPicker({ kind: "month", month: { year: 2026, month: 7 } });

    // when
    fireEvent.click(screen.getByLabelText("Previous month"));

    // then
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

  it("should jump straight to a month a user picked", () => {
    // given
    const onChange = renderPicker({ kind: "month", month: { year: 2026, month: 8 } });

    // when
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "6" } });

    // then
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2026, month: 6 } });
  });

  it("should disable months the backfill has not reached", () => {
    // given / when
    renderPicker({ kind: "month", month: { year: 2026, month: 8 } });

    // then
    // Visible but unselectable, so the gap reads as "not collected yet" rather
    // than as a list that mysteriously starts in June.
    expect(screen.getByRole("option", { name: "January" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "July" })).not.toBeDisabled();
  });

  it("should keep the month across a year change when that year has it", () => {
    // given
    const months: MonthSelection[] = [
      { year: 2026, month: 8 },
      { year: 2025, month: 8 },
      { year: 2025, month: 7 },
    ];
    const onChange = renderPicker(
      { kind: "month", month: { year: 2026, month: 8 } },
      jest.fn(),
      months,
    );

    // when
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2025" } });

    // then
    // "The same month last year" is the comparison this control exists for.
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2025, month: 8 } });
  });

  it("should fall back to the newest month of a year that lacks the current one", () => {
    // given
    const months: MonthSelection[] = [
      { year: 2026, month: 8 },
      { year: 2025, month: 11 },
    ];
    const onChange = renderPicker(
      { kind: "month", month: { year: 2026, month: 8 } },
      jest.fn(),
      months,
    );

    // when
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2025" } });

    // then
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: { year: 2025, month: 11 } });
  });

  it("should ignore a year with no months at all", () => {
    // given
    const onChange = renderPicker({ kind: "month", month: { year: 2026, month: 8 } });

    // when
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1999" } });

    // then
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should cope with no months being offered at all", () => {
    // given
    const onChange = renderPicker(preset("day"), jest.fn(), []);

    // when
    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "__month__" } });

    // then
    // Coverage can be empty on a brand new install; the picker should stay put
    // rather than select a month nothing can answer.
    expect(onChange).not.toHaveBeenCalled();
  });
});
