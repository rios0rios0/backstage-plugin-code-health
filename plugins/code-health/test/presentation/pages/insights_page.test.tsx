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

describe("InsightsPage fleet coverage, documentation and API cards", () => {
  it("should report the fleet's test coverage", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("covered").withCoverage(90).build(),
      RepositoryBuilder.create().withName("middling").withCoverage(20).build(),
      RepositoryBuilder.create().withName("bare").withCoverage(10).build(),
    ]);

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() =>
      expect(screen.getByText("Test coverage across the fleet")).toBeInTheDocument(),
    );
    // The mean and the median are deliberately different here: a mean over a
    // fleet with a long tail of untested repositories says little on its own,
    // which is why both are on the card.
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    // The median tile and the middling repository's bar both read 20.0%.
    expect(screen.getAllByText("20.0%")).toHaveLength(2);
    // Ascending, so the repository that needs the work is at the top.
    expect(screen.getByLabelText(/^bare: 10\.0% coverage/)).toBeInTheDocument();
  });

  it("should say when nothing reports a Sonar measure at all", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").build(),
    ]);

    // when
    renderPage({ dashboardService });

    // then
    // A fleet with no Sonar projects is not a fleet with 0% coverage, and the
    // page has to say which it is looking at.
    await waitFor(() =>
      expect(screen.getByText(/No repository in this window reports/)).toBeInTheDocument(),
    );
  });

  it("should name the repositories whose documentation was never published", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create()
        .withName("gateway")
        .withDocumentationState("unpublished", { hasDocsSource: true })
        .build(),
    ]);

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() =>
      expect(screen.getByText("Written but not published")).toBeInTheDocument(),
    );
    expect(screen.getByText("has a docs/ tree")).toBeInTheDocument();
  });

  it("should flag the repositories that could be catalog APIs and are not", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create()
        .withName("gateway")
        .withApiExposureState("candidate", "api/openapi.yaml")
        .build(),
    ]);

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() => expect(screen.getByText("Catalog APIs")).toBeInTheDocument());
    expect(screen.getByText("api/openapi.yaml")).toBeInTheDocument();
  });

  it("should say so when there is no documentation or API gap left", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create()
        .withName("gateway")
        .withDocumentationState("documented")
        .withApiExposureState("declared")
        .build(),
    ]);

    // when
    renderPage({ dashboardService });

    // then
    await waitFor(() =>
      expect(
        screen.getByText("Every repository that writes documentation publishes it."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "Every repository that looks like it serves an API already declares one.",
      ),
    ).toBeInTheDocument();
  });
});
