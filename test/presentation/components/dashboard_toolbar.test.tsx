import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardToolbar } from "../../../src/presentation/components/dashboard_toolbar";

const defaultProps = {
  lastFetchedAt: null as Date | null,
  refreshInterval: 300000 as const,
  isLoading: false,
  onRefresh: vi.fn(),
  onIntervalChange: vi.fn(),
};

describe("DashboardToolbar", () => {
  it("should render the refresh button", () => {
    // given / when
    render(<DashboardToolbar {...defaultProps} />);

    // then
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("should display 'Loading...' and disable the button while loading", () => {
    // given / when
    render(<DashboardToolbar {...defaultProps} isLoading />);

    // then
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
  });

  it("should call onRefresh when the refresh button is clicked", () => {
    // given
    const onRefresh = vi.fn();
    render(<DashboardToolbar {...defaultProps} onRefresh={onRefresh} />);

    // when
    fireEvent.click(screen.getByText("Refresh"));

    // then
    expect(onRefresh).toHaveBeenCalled();
  });

  it("should render every auto refresh option", () => {
    // given / when
    render(<DashboardToolbar {...defaultProps} />);

    // then
    const select = screen.getByLabelText("Auto refresh interval");
    expect(select).toHaveValue("300000");
    expect(screen.getByText("Auto: 1 min")).toBeInTheDocument();
    expect(screen.getByText("Auto: 15 min")).toBeInTheDocument();
    expect(screen.getByText("Auto: Off")).toBeInTheDocument();
  });

  it("should call onIntervalChange with the numeric interval", () => {
    // given
    const onIntervalChange = vi.fn();
    render(<DashboardToolbar {...defaultProps} onIntervalChange={onIntervalChange} />);

    // when
    fireEvent.change(screen.getByLabelText("Auto refresh interval"), {
      target: { value: "60000" },
    });

    // then
    expect(onIntervalChange).toHaveBeenCalledWith(60000);
  });

  it("should render the last updated time when provided", () => {
    // given
    const date = new Date("2026-03-21T10:30:00Z");

    // when
    render(<DashboardToolbar {...defaultProps} lastFetchedAt={date} />);

    // then
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it("should not render a last updated time before the first fetch", () => {
    // given / when
    render(<DashboardToolbar {...defaultProps} />);

    // then
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});
