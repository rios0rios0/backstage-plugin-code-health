import { appThemeApiRef } from "@backstage/core-plugin-api";
import { renderInTestApp, TestApiProvider } from "@backstage/test-utils";
import { screen, waitFor } from "@testing-library/react";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../src/domain/entities/code_health_config";
import {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
} from "../../src/main/api_refs";
import { Router } from "../../src/main/router";
import { RepositoryBuilder } from "../builders/repository_builder";
import { StubAppThemeApi } from "../doubles/stub_app_theme_api";
import { StubContributorService } from "../doubles/stub_contributor_service";
import { StubCoverageService } from "../doubles/stub_coverage_service";
import { StubDashboardService } from "../doubles/stub_dashboard_service";
import { StubTimeSeriesService } from "../doubles/stub_time_series_service";

const renderRouter = async (
  overrides: {
    dashboardService?: StubDashboardService;
    contributorService?: StubContributorService;
    coverageService?: StubCoverageService;
    timeSeriesService?: StubTimeSeriesService;
  } = {},
) => {
  const dashboardService = overrides.dashboardService ?? new StubDashboardService();
  const contributorService = overrides.contributorService ?? new StubContributorService();
  const coverageService = overrides.coverageService ?? new StubCoverageService();
  const timeSeriesService = overrides.timeSeriesService ?? new StubTimeSeriesService();

  await renderInTestApp(
    <TestApiProvider
      apis={[
        [appThemeApiRef, new StubAppThemeApi("light")],
        [codeHealthConfigApiRef, DEFAULT_CODE_HEALTH_CONFIG],
        [codeHealthRepositoriesApiRef, dashboardService],
        [codeHealthContributorsApiRef, contributorService],
        [codeHealthCoverageApiRef, coverageService],
        [codeHealthTimeSeriesApiRef, timeSeriesService],
      ]}
    >
      <Router />
    </TestApiProvider>,
  );

  return { dashboardService, contributorService, coverageService, timeSeriesService };
};

describe("Router", () => {
  it("should render the dashboard once coverage has been read", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").build(),
    ]);

    // when
    await renderRouter({ dashboardService });

    // then
    expect(await screen.findByText("user/gateway")).toBeInTheDocument();
  });

  it("should show every tab", async () => {
    // given / when
    await renderRouter();

    // then
    // The settings tab is gone: there is nothing left for a user to configure
    // now that credentials live in the backend's `integrations` block.
    expect(await screen.findByRole("tab", { name: "Repositories" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Contributors" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Insights" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("should explain that the backend is missing when coverage cannot be read", async () => {
    // given
    // "The backend is not installed" and "the backfill has not started" look
    // identical from an empty dashboard, so the distinction has to be stated.
    const coverageService = new StubCoverageService().withError(new Error("404 Not Found"));

    // when
    await renderRouter({ coverageService });

    // then
    expect(
      await screen.findByText(/The Code Health backend is not reachable/),
    ).toBeInTheDocument();
  });

  it("should not ask for repositories while the backend is unreachable", async () => {
    // given
    const coverageService = new StubCoverageService().withError(new Error("nope"));
    const dashboardService = new StubDashboardService();

    // when
    await renderRouter({ coverageService, dashboardService });

    // then
    await waitFor(() =>
      expect(screen.getByText(/The Code Health backend is not reachable/)).toBeInTheDocument(),
    );
    expect(dashboardService.callCount).toBe(0);
  });
});
