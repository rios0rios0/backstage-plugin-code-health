import { fireEvent, render, screen } from "@testing-library/react";
import {
  formatTrendDay,
  TrendChart,
  type TrendPoint,
} from "../../../../src/presentation/components/charts/trend_chart";

const aPoint = (day: string, bugs: number | null, coverage: number | null = null): TrendPoint => ({
  day,
  values: { bugs, coverage },
});

const SERIES = [
  { key: "bugs", label: "Bugs", area: true },
  { key: "coverage", label: "Coverage" },
];

const givenTheChartIs = (width: number) => {
  const svg = screen.getByRole("img");
  jest.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width,
    height: 200,
    right: width,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return svg;
};

describe("TrendChart", () => {
  it("should show the empty message when there are no points", () => {
    // given / when
    render(<TrendChart points={[]} series={SERIES} emptyMessage="Nothing here." />);

    // then
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("should label itself with the series names and the range by default", () => {
    // given
    const points = [aPoint("2026-08-01", 3, 50), aPoint("2026-08-08", 2, 60)];

    // when
    render(<TrendChart points={points} series={SERIES} />);

    // then
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      `Bugs and Coverage from ${formatTrendDay("2026-08-01")} to ${formatTrendDay("2026-08-08")}`,
    );
  });

  it("should draw only two series, however many are passed", () => {
    // given
    const points = [aPoint("2026-08-01", 3, 50)];
    const series = [...SERIES, { key: "extra", label: "Extra" }];

    // when
    render(<TrendChart points={points} series={series} />);

    // then
    // The palette carries two series colours on purpose; a third would have
    // no colour that survives a colour-vision check.
    expect(screen.queryByText("Extra")).not.toBeInTheDocument();
    expect(screen.getByText("Bugs")).toBeInTheDocument();
  });

  it("should break the line where a bucket was not measured", () => {
    // given
    const points = [
      aPoint("2026-08-01", 3),
      aPoint("2026-08-08", null),
      aPoint("2026-08-15", 5),
    ];

    // when
    const { container } = render(<TrendChart points={points} series={[SERIES[0]]} />);

    // then
    // Two runs, two polylines: a gap is a gap, not a zero.
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(container.querySelectorAll("polygon")).toHaveLength(2);
  });

  it("should say a hovered bucket was not measured rather than showing zero", () => {
    // given
    const points = [aPoint("2026-08-01", null, 40), aPoint("2026-08-08", 7, 45)];
    render(<TrendChart points={points} series={SERIES} />);
    const svg = givenTheChartIs(720);

    // when
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 50 });

    // then
    expect(screen.getByText("not measured", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("40", { selector: "strong" })).toBeInTheDocument();
  });

  it("should format the values it prints", () => {
    // given
    const points = [aPoint("2026-08-01", 3, 50), aPoint("2026-08-08", 2, 60)];
    render(
      <TrendChart
        points={points}
        series={[SERIES[1]]}
        scaleMax={100}
        formatValue={(value) => `${value}%`}
      />,
    );
    const svg = givenTheChartIs(720);

    // when
    fireEvent.mouseMove(svg, { clientX: 700, clientY: 50 });

    // then
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("60%", { selector: "strong" })).toBeInTheDocument();
  });

  it("should fall back to the raw value for a day it cannot parse", () => {
    // given / when / then
    expect(formatTrendDay("not-a-day")).toBe("not-a-day");
  });
});
