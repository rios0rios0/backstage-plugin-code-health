import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContributorsTable } from "../../../src/presentation/components/contributors_table";
import { ContributorBuilder } from "../../builders/contributor_builder";

describe("ContributorsTable", () => {
  const defaultProps = {
    totalCount: 0,
    isLoading: false,
    onDateRangeApply: vi.fn(),
  };

  it("should render 'No contributors found.' when contributors is empty", () => {
    // given / when
    render(<ContributorsTable {...defaultProps} contributors={[]} />);

    // then
    expect(screen.getByText("No contributors found.")).toBeInTheDocument();
  });

  it("should render loading skeleton when isLoading is true", () => {
    // given / when
    const { container } = render(
      <ContributorsTable {...defaultProps} contributors={[]} isLoading={true} />,
    );

    // then
    const skeletonRows = container.querySelectorAll("[data-testid=\"loadingRow\"]");
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it("should render contributor rows with avatar, username, PR counts, and LOC", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withUsername("alice")
        .withApprovedPRs(8)
        .withLinesOfCode(5000)
        .build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("5,000")).toBeInTheDocument();
  });

  it("should render approval rate with green color for rate >= 80", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withPrApprovalRate(85).build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    const rateEl = screen.getByText("85.0%");
    expect(rateEl.getAttribute("data-tone")).toBe("good");
  });

  it("should render approval rate with yellow color for rate >= 50 and < 80", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withPrApprovalRate(65).build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    const rateElements = screen.getAllByText("65.0%");
    const approvalRateEl = rateElements[0];
    expect(approvalRateEl.getAttribute("data-tone")).toBe("fair");
  });

  it("should render approval rate with red color for rate < 50", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withPrApprovalRate(30).build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    const rateElements = screen.getAllByText("30.0%");
    const approvalRateEl = rateElements[0];
    expect(approvalRateEl.getAttribute("data-tone")).toBe("poor");
  });

  it("should show WakaTime columns when any contributor has wakaTimeMetrics", () => {
    // given
    const contributors = [
      {
        ...ContributorBuilder.create().withUsername("alice").build(),
        wakaTimeMetrics: { totalSeconds: 3600, dailyAverageSeconds: 1800 },
      },
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    expect(screen.getByText("Total Time (30d)")).toBeInTheDocument();
    expect(screen.getByText("Daily Avg")).toBeInTheDocument();
  });

  it("should hide WakaTime columns when no contributor has wakaTimeMetrics", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    expect(screen.queryByText("Total Time (30d)")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily Avg")).not.toBeInTheDocument();
  });

  it("should call onDateRangeApply when Apply button is clicked with date inputs", () => {
    // given
    const onDateRangeApply = vi.fn();
    const contributors = [ContributorBuilder.create().build()];
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        onDateRangeApply={onDateRangeApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("Date from"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Date to"), {
      target: { value: "2026-02-01" },
    });

    // when
    fireEvent.click(screen.getByText("Apply"));

    // then
    expect(onDateRangeApply).toHaveBeenCalledWith("2026-01-01", "2026-02-01");
  });

  it("should render contributor count", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("a").build(),
      ContributorBuilder.create().withUsername("b").build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={5}
        isLoading={false}
        onDateRangeApply={vi.fn()}
      />,
    );

    // then
    expect(screen.getByText(/2 of 5 contributors/)).toBeInTheDocument();
  });
});
