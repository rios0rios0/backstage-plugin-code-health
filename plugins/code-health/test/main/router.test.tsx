import { appThemeApiRef } from "@backstage/core-plugin-api";
import { renderInTestApp, TestApiProvider } from "@backstage/test-utils";
import { screen, waitFor } from "@testing-library/react";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../src/domain/entities/code_health_config";
import {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthIdentitiesApiRef,
  codeHealthIntegrationsApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
} from "../../src/main/api_refs";
import { Router } from "../../src/main/router";
import { RepositoryBuilder } from "../builders/repository_builder";
import { StubAppThemeApi } from "../doubles/stub_app_theme_api";
import { StubIdentityService } from "../doubles/stub_identity_service";
import { StubIntegrationsService } from "../doubles/stub_integrations_service";
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
    integrationsService?: StubIntegrationsService;
    identityService?: StubIdentityService;
    /** Which tab to land on. Defaults to the root, which is Insights. */
    path?: string;
  } = {},
) => {
  const dashboardService = overrides.dashboardService ?? new StubDashboardService();
  const contributorService = overrides.contributorService ?? new StubContributorService();
  const coverageService = overrides.coverageService ?? new StubCoverageService();
  const timeSeriesService = overrides.timeSeriesService ?? new StubTimeSeriesService();
  const integrationsService = overrides.integrationsService ?? new StubIntegrationsService();
  const identityService = overrides.identityService ?? new StubIdentityService();

  await renderInTestApp(
    <TestApiProvider
      apis={[
        [appThemeApiRef, new StubAppThemeApi("light")],
        [codeHealthConfigApiRef, DEFAULT_CODE_HEALTH_CONFIG],
        [codeHealthRepositoriesApiRef, dashboardService],
        [codeHealthContributorsApiRef, contributorService],
        [codeHealthCoverageApiRef, coverageService],
        [codeHealthTimeSeriesApiRef, timeSeriesService],
        [codeHealthIntegrationsApiRef, integrationsService],
        [codeHealthIdentitiesApiRef, identityService],
      ]}
    >
      <Router />
    </TestApiProvider>,
    { routeEntries: [overrides.path ?? "/"] },
  );

  return {
    dashboardService,
    contributorService,
    coverageService,
    timeSeriesService,
    integrationsService,
    identityService,
  };
};

describe("Router", () => {
  it("should land on the insights tab once coverage has been read", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").build(),
    ]);

    // when
    await renderRouter({ dashboardService });

    // then
    // Insights leads because it is the only tab that answers a question about
    // the fleet rather than about one row of it.
    expect(await screen.findByText("At a glance")).toBeInTheDocument();
  });

  it("should render the repositories table on its own tab", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").build(),
    ]);

    // when
    await renderRouter({ dashboardService, path: "/repositories" });

    // then
    expect(await screen.findByText("user/gateway")).toBeInTheDocument();
  });

  it("should show every tab, insights first", async () => {
    // given / when
    await renderRouter();

    // then
    // The settings tab is gone: there is nothing left for a user to configure
    // now that credentials live in the backend's `integrations` block.
    const tabs = await screen.findAllByRole("tab");
    // Identities sits last because it is maintenance rather than a measurement,
    // even though what it decides shapes every tab in front of it.
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Insights",
      "Contributors",
      "Repositories",
      "Identities",
    ]);
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
