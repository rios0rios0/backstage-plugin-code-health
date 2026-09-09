import { appThemeApiRef } from "@backstage/core-plugin-api";
import { renderInTestApp, TestApiProvider } from "@backstage/test-utils";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../src/domain/entities/code_health_config";
import {
  codeHealthAdministrationApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthIdentitiesApiRef,
  codeHealthIntegrationsApiRef,
  codeHealthOwnershipApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
  codeHealthTrendsApiRef,
} from "../../src/main/api_refs";
import { Router } from "../../src/main/router";
import { rootRouteRef } from "../../src/routes";
import { ContributorBuilder } from "../builders/contributor_builder";
import { RepositoryBuilder } from "../builders/repository_builder";
import { StubAdministrationService } from "../doubles/stub_administration_service";
import { StubAppThemeApi } from "../doubles/stub_app_theme_api";
import { StubOwnershipService } from "../doubles/stub_ownership_service";
import {
  aContributorTrend,
  aRepositoryTrend,
  StubTrendService,
} from "../doubles/stub_trend_service";
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
    trendService?: StubTrendService;
    ownershipService?: StubOwnershipService;
    administrationService?: StubAdministrationService;
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
  const trendService = overrides.trendService ?? new StubTrendService();
  const ownershipService = overrides.ownershipService ?? new StubOwnershipService();
  const administrationService =
    overrides.administrationService ?? new StubAdministrationService();

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
        [codeHealthTrendsApiRef, trendService],
        [codeHealthOwnershipApiRef, ownershipService],
        [codeHealthAdministrationApiRef, administrationService],
      ]}
    >
      {/* Mounted behind a splat route, the way a consuming app mounts the
          plugin. It is not decoration: `TabbedLayout` reads the splat parameter
          to decide which tab is selected, so a router rendered bare resolves
          its content from the location but reports the first tab selected
          whatever is on screen. The detail pages and both tables also resolve
          their links through `useRouteRef`, which needs the mounted route ref
          below to resolve a sub route against and throws without one. */}
      <Routes>
        <Route path="/*" element={<Router />} />
      </Routes>
    </TestApiProvider>,
    { mountedRoutes: { "/*": rootRouteRef }, routeEntries: [overrides.path ?? "/"] },
  );

  return {
    dashboardService,
    contributorService,
    coverageService,
    timeSeriesService,
    integrationsService,
    identityService,
    trendService,
    ownershipService,
    administrationService,
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
    expect(screen.getByText("Delivery cadence")).toBeInTheDocument();
    expect(screen.getByText("Test coverage across the fleet")).toBeInTheDocument();
    // Everything that names a person or a repository moved to the tab that
    // lists them, where each row is also the way into its detail page.
    expect(screen.queryByText("Top contributors")).not.toBeInTheDocument();
    expect(screen.queryByText("Documentation")).not.toBeInTheDocument();
  });

  it("should rank people and repositories on the contributors tab", async () => {
    // given
    const contributorService = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").withCommits(30).build(),
    ]);
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").withActivity({ commits: 9 }).build(),
    ]);

    // when
    await renderRouter({ contributorService, dashboardService, path: "/contributors" });

    // then
    expect(await screen.findByText("Top contributors")).toBeInTheDocument();
    expect(screen.getByText("Review load")).toBeInTheDocument();
    expect(screen.getByText("Most active repositories")).toBeInTheDocument();
  });

  it("should render the repositories table on its own tab, under the audits", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").build(),
    ]);

    // when
    await renderRouter({ dashboardService, path: "/repositories" });

    // then
    expect(await screen.findByText("user/gateway")).toBeInTheDocument();
    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByText("Catalog APIs")).toBeInTheDocument();
    expect(screen.getByText("Fleet health")).toBeInTheDocument();
  });

  it("should open a person's page under the contributors tab", async () => {
    // given
    // `TabbedLayout` matches every tab as `<path>/*`, so the detail route
    // resolves relative to the tab and the tab stays selected while somebody is
    // open — which is the whole reason the page is nested rather than routed at
    // the plugin root.
    const trendService = new StubTrendService().withContributorTrend(
      aContributorTrend({
        summary: ContributorBuilder.create().withDisplayName("Jane Roe").build(),
      }),
    );

    // when
    await renderRouter({
      trendService,
      path: "/contributors/person?key=user%3Adefault%2Fjane",
    });

    // then
    expect(await screen.findByText("Jane Roe")).toBeInTheDocument();
    // The key survives the round trip: it carries a colon and a slash, which is
    // why it travels in the query string rather than in a path segment.
    expect(trendService.contributorCalls[0].key).toBe("user:default/jane");
    expect(screen.getByRole("tab", { name: "Contributors" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("should open a repository's page under the repositories tab", async () => {
    // given
    // `TabbedLayout` matches each tab as `<path>/*`, so the detail route resolves
    // relative to the tab and the tab stays selected while a repository is open.
    const trendService = new StubTrendService().withRepositoryTrend(
      aRepositoryTrend({
        summary: RepositoryBuilder.create().withId("repo-1").withName("gateway").build(),
      }),
    );

    // when
    await renderRouter({ trendService, path: "/repositories/repo-1" });

    // then
    expect(await screen.findByText("user/gateway")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Repositories" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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

  it("should offer the re-collect control to an administrator", async () => {
    // given
    const administrationService = new StubAdministrationService().withAdministrator();

    // when
    await renderRouter({ administrationService });

    // then
    // It sits in the page header rather than on a tab, because it is not a
    // measurement of anything — it is the one thing on the dashboard that
    // changes what the backend does.
    expect(await screen.findByRole("button", { name: "Re-collect history" })).toBeInTheDocument();
  });

  it("should keep the re-collect control off the header for everybody else", async () => {
    // given
    // The stub refuses by default, which is what a fresh install answers until
    // somebody is named in `codeHealth.administrators`.
    const administrationService = new StubAdministrationService();

    // when
    await renderRouter({ administrationService });

    // then
    await waitFor(() => expect(administrationService.accessCalls).toBe(1));
    expect(
      screen.queryByRole("button", { name: "Re-collect history" }),
    ).not.toBeInTheDocument();
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
