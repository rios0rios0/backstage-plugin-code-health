import { render, screen, fireEvent, within } from "@testing-library/react";
import { ContributorsTable } from "../../../src/presentation/components/contributors_table";
import { ContributorBuilder } from "../../builders/contributor_builder";

describe("ContributorsTable", () => {
  const defaultProps = {
    totalCount: 0,
    isLoading: false,
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
      <ContributorsTable {...defaultProps} contributors={[]} isLoading />,
    );

    // then
    const skeletonRows = container.querySelectorAll("[data-testid=\"loadingRow\"]");
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it("should render contributor rows with avatar, displayName, PR counts, and LOC", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withReviewsApproved(8)
        .withLinesOfCode(5000)
        .build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
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
        ...ContributorBuilder.create().withDisplayName("alice").build(),
        wakaTimeMetrics: { totalSeconds: 3600, dailyAverageSeconds: 1800 },
      },
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
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
      />,
    );

    // then
    expect(screen.queryByText("Total Time (30d)")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily Avg")).not.toBeInTheDocument();
  });

  it("should render contributor count", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("a").build(),
      ContributorBuilder.create().withDisplayName("b").build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={5}
        isLoading={false}
      />,
    );

    // then
    expect(screen.getByText(/2 of 5 contributors/)).toBeInTheDocument();
  });

  it("should show a dash in every Sonar cell of a contributor with no metrics", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("unmeasured").build(),
    ];
    const sonarHeaders = ["Bugs", "Smells", "Vulns", "Hotspots", "Coverage", "Dups", "Debt"];

    // when
    render(<ContributorsTable {...defaultProps} contributors={contributors} totalCount={1} />);

    // then
    const headerCells = screen.getAllByRole("columnheader");
    const dataCells = within(screen.getAllByRole("row")[2]).getAllByRole("cell");
    for (const header of sonarHeaders) {
      const index = headerCells.findIndex((cell) => cell.textContent?.includes(header));
      expect(dataCells[index]).toHaveTextContent("-");
    }
  });

  it("should render coverage, duplications and debt when Sonar measured the contributor", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("measured")
        .withSonarMetrics({
          bugs: 1,
          codeSmells: 2,
          securityHotspots: 3,
          vulnerabilities: 4,
          coverage: 87.5,
          duplications: 3.25,
          technicalDebt: "2h 15min",
          qualityGateStatus: "OK",
        })
        .build(),
    ];

    // when
    render(<ContributorsTable {...defaultProps} contributors={contributors} totalCount={1} />);

    // then
    expect(screen.getByText("87.5%")).toBeInTheDocument();
    expect(screen.getByText("3.3%")).toBeInTheDocument();
    expect(screen.getByText("2h 15min")).toBeInTheDocument();
  });

  it("should leave the WakaTime cells empty for a contributor with no tracked time", () => {
    // given
    const tracked = ContributorBuilder.create().withDisplayName("tracked").build();
    const untracked = ContributorBuilder.create().withDisplayName("untracked").build();
    const contributors = [
      { ...tracked, wakaTimeMetrics: { totalSeconds: 9000, dailyAverageSeconds: 1800 } },
      untracked,
    ];

    // when
    render(<ContributorsTable {...defaultProps} contributors={contributors} totalCount={2} />);

    // then
    expect(screen.getByText("2h 30m")).toBeInTheDocument();
    expect(screen.getByText("30m")).toBeInTheDocument();
  });

  it("should page through more contributors than fit on one page", () => {
    // given
    const contributors = Array.from({ length: 30 }, (_, index) =>
      ContributorBuilder.create()
        .withDisplayName(`user-${String(index).padStart(2, "0")}`)
        .withLinesOfCode(index)
        .build(),
    );
    render(
      <ContributorsTable {...defaultProps} contributors={contributors} totalCount={30} />,
    );

    // when
    fireEvent.click(screen.getByText("Next"));

    // then
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    // when
    fireEvent.click(screen.getByText("Previous"));

    // then
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});
