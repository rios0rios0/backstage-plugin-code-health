import { fireEvent, render, screen } from "@testing-library/react";
import {
  TrendRangePicker,
  trendRangeLabel,
} from "../../../src/presentation/components/trend_range_picker";

describe("TrendRangePicker", () => {
  it("should list every count offered, in months", () => {
    // given / when
    render(<TrendRangePicker months={3} offered={[1, 2, 3]} onChange={() => undefined} />);

    // then
    const select = screen.getByLabelText("Trend range") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Last month",
      "Last 2 months",
      "Last 3 months",
    ]);
    expect(select.value).toBe("3");
  });

  it("should report the count picked as a number", () => {
    // given
    const picked: number[] = [];
    render(<TrendRangePicker months={1} offered={[1, 2, 3]} onChange={(m) => picked.push(m)} />);

    // when
    fireEvent.change(screen.getByLabelText("Trend range"), { target: { value: "2" } });

    // then
    expect(picked).toEqual([2]);
  });

  it("should say why the list is short while the history is still being collected", () => {
    // given / when
    render(<TrendRangePicker months={1} offered={[1]} onChange={() => undefined} />);

    // then
    expect(screen.getByText(/Wider ranges unlock/)).toBeInTheDocument();
  });

  it("should say nothing once every count is offered", () => {
    // given / when
    render(
      <TrendRangePicker months={6} offered={[1, 2, 3, 4, 5, 6]} onChange={() => undefined} />,
    );

    // then
    expect(screen.queryByText(/Wider ranges unlock/)).not.toBeInTheDocument();
  });

  it("should label a single month without a count", () => {
    // given / when / then
    expect(trendRangeLabel(1)).toBe("Last month");
    expect(trendRangeLabel(4)).toBe("Last 4 months");
  });
});
