import { fireEvent, render, screen } from "@testing-library/react";
import type { CadencePoint } from "../../../../src/domain/entities/insights";
import { CadenceChart } from "../../../../src/presentation/components/charts/cadence_chart";

const aPoint = (day: string, commits: number, merged = 0): CadencePoint => ({
  day,
  commits,
  pullRequestsMerged: merged,
});

/**
 * jsdom gives every element a zero-sized box, and the chart maps the pointer
 * from client pixels into viewBox units by dividing by that width. Without a
 * size the division is a NaN that no assertion would explain.
 */
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

describe("CadenceChart", () => {
  it("should say so when the window holds no activity", () => {
    // given
    const points: CadencePoint[] = [];

    // when
    render(<CadenceChart points={points} />);

    // then
    expect(screen.getByText(/No activity was recorded/)).toBeInTheDocument();
  });

  it("should name both series in the legend", () => {
    // given
    // Two series always carry a legend, so identity never rests on colour alone.
    const points = [aPoint("2026-08-01", 5, 2), aPoint("2026-08-02", 9, 4)];

    // when
    render(<CadenceChart points={points} />);

    // then
    expect(screen.getByText("Commits")).toBeInTheDocument();
    expect(screen.getByText("Pull requests merged")).toBeInTheDocument();
  });

  it("should label the chart with the range it covers", () => {
    // given
    const points = [aPoint("2026-08-01", 5), aPoint("2026-08-03", 9)];

    // when
    render(<CadenceChart points={points} />);

    // then
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Aug 1"),
    );
  });

  it("should centre a lone point rather than dividing by zero", () => {
    // given
    // One bucket means `points.length - 1` is zero, which is the denominator
    // the x scale would otherwise use.
    const points = [aPoint("2026-08-01", 5, 1)];

    // when
    render(<CadenceChart points={points} />);

    // then
    const line = document.querySelectorAll("polyline")[0];
    expect(line.getAttribute("points")).not.toContain("NaN");
  });

  it("should show a tooltip for the bucket under the pointer", () => {
    // given
    const points = [aPoint("2026-08-01", 5, 2), aPoint("2026-08-02", 40, 11)];
    render(<CadenceChart points={points} />);
    const svg = givenTheChartIs(720);

    // when
    fireEvent.mouseMove(svg, { clientX: 40 });

    // then
    expect(screen.getByText(/Commits:/)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("should read the last bucket too, with the tooltip flipped inside the plot", () => {
    // given
    // A tooltip anchored right of the crosshair would leave the page at the
    // final bucket, which is the one a reader looks at most.
    const points = [aPoint("2026-08-01", 5, 2), aPoint("2026-08-02", 40, 11)];
    render(<CadenceChart points={points} />);
    const svg = givenTheChartIs(720);

    // when
    fireEvent.mouseMove(svg, { clientX: 715 });

    // then
    // Scoped to the tooltip: the y-axis tops out at 40 too, so a bare text
    // query would match the axis tick as well.
    expect(screen.getByText("40", { selector: "strong" })).toBeInTheDocument();
  });

  it("should drop the tooltip when the pointer leaves", () => {
    // given
    const points = [aPoint("2026-08-01", 5, 2), aPoint("2026-08-02", 40, 11)];
    render(<CadenceChart points={points} />);
    const svg = givenTheChartIs(720);
    fireEvent.mouseMove(svg, { clientX: 40 });

    // when
    fireEvent.mouseLeave(svg);

    // then
    expect(screen.queryByText(/Commits:/)).not.toBeInTheDocument();
  });

  it("should clamp a pointer dragged outside the plot to a real bucket", () => {
    // given
    const points = [aPoint("2026-08-01", 5, 2), aPoint("2026-08-02", 40, 11)];
    render(<CadenceChart points={points} />);
    const svg = givenTheChartIs(720);

    // when
    // Left of the y-axis, which maps to a negative index.
    fireEvent.mouseMove(svg, { clientX: -50 });

    // then
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("should fall back to the raw value for a day it cannot parse", () => {
    // given
    // A malformed bucket should print as-is rather than as `Invalid Date`.
    const points = [aPoint("not-a-day", 5), aPoint("2026-08-02", 9)];

    // when
    render(<CadenceChart points={points} />);

    // then
    expect(screen.getByText("not-a-day")).toBeInTheDocument();
  });

  it("should keep a flat all-zero series on the baseline without dividing by zero", () => {
    // given
    const points = [aPoint("2026-08-01", 0), aPoint("2026-08-02", 0)];

    // when
    render(<CadenceChart points={points} />);

    // then
    const line = document.querySelectorAll("polyline")[0];
    expect(line.getAttribute("points")).not.toContain("NaN");
  });
});
