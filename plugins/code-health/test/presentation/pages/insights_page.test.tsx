import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../../src/domain/entities/code_health_config";
import type { UseCoverageResult } from "../../../src/presentation/hooks/use_coverage";
import { InsightsPage } from "../../../src/presentation/pages/insights_page";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { StubContributorService } from "../../doubles/stub_contributor_service";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";
import { StubDashboardService } from "../../doubles/stub_dashboard_service";
import { StubTimeSeriesService } from "../../doubles/stub_time_series_service";

const coverageResult = (overrides: Partial<UseCoverageResult> = {}): UseCoverageResult => ({
  coverage: aCoverageInfo(),
  isLoading: false,
  error: null,
  reload: async () => undefined,
  ...overrides,
});

const renderPage = (
  overrides: {
    dashboardService?: StubDashboardService;
    contributorService?: StubContributorService;
    timeSeriesService?: StubTimeSeriesService;
  } = {},
) => {
  const dashboardService =
    overrides.dashboardService ??
    new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").withActivity({ commits: 9 }).build(),
    ]);
  const contributorService = overrides.contributorService ?? new StubContributorService();
  const timeSeriesService = overrides.timeSeriesService ?? new StubTimeSeriesService();

  render(
    // The rankings link to catalog entities, so the page needs a router.
    <MemoryRouter>
      <InsightsPage
        dashboardService={dashboardService}
        contributorService={contributorService}
        timeSeriesService={timeSeriesService}
        coverage={coverageResult()}
        config={DEFAULT_CODE_HEALTH_CONFIG}
      />
    </MemoryRouter>,
  );

  return { dashboardService, contributorService, timeSeriesService };
};

describe("InsightsPage", () => {
  it("should render the headline figures once the data arrives", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").withActivity({ commits: 12 }).build(),
      RepositoryBuilder.create().withName("idle").withActivity({ commits: 0 }).build(),
    ]);

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() => expect(screen.getByText("Active repos")).toBeInTheDocument());
    expect(screen.getByText("of 2 tracked")).toBeInTheDocument();
  });

  it("should rank contributors by commits", async () => {
    // given
    const contributorService = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").withCommits(30).build(),
      ContributorBuilder.create().withDisplayName("bob").withCommits(2).build(),
    ]);

    // when
    renderPage({ contributorService });

    // then
    await waitFor(() => expect(screen.getByText("Top contributors")).toBeInTheDocument());
    const ranked = screen.getAllByRole("listitem").map((item) => item.getAttribute("aria-label"));
    expect(ranked[0]).toContain("alice: 30 commits");
  });

  it("should link a contributor that resolved to a catalog user", async () => {
    // given
    const contributorService = new StubContributorService().withContributors([
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withCommits(30)
        .withEntityRef("user:default/alice")
        .withReviewsGiven(0)
        .build(),
    ]);

    // when
    renderPage({ contributorService });

    // then
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "alice" })).toHaveAttribute(
      "href",
      "/catalog/default/user/alice",
    );
  });

  it("should ask for daily buckets over a short window", async () => {
    // given
    // A month of daily points is readable; a year of them is noise, which is why
    // the bucket follows the range instead of being a second control.
    const timeSeriesService = new StubTimeSeriesService();

    // when
    renderPage({ timeSeriesService });

    // then
    await waitFor(() => expect(timeSeriesService.callCount).toBeGreaterThan(0));
    expect(timeSeriesService.buckets[0]).toBe("day");
  });

  it("should say so when there is nothing to chart", async () => {
    // given
    // An empty page with six zeroes on it reads as a broken dashboard.
    const dashboardService = new StubDashboardService().withRepositories([]);

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() =>
      expect(screen.getByText(/No repositories were tracked/)).toBeInTheDocument(),
    );
  });

  it("should display the error a failed fetch carried", async () => {
    // given
    const dashboardService = new StubDashboardService().withError(new Error("Server error"));

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });
});
