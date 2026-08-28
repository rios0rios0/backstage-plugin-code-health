import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { appThemeApiRef } from "@backstage/core-plugin-api";
import { renderInTestApp, TestApiProvider } from "@backstage/test-utils";
import { CodeHealthPage } from "../src/plugin";
import { rootRouteRef } from "../src/routes";
import {
  codeHealthCoverageApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthIdentitiesApiRef,
  codeHealthIntegrationsApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
} from "../src/main/api_refs";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../src/domain/entities/code_health_config";
import { StubAppThemeApi } from "./doubles/stub_app_theme_api";
import { StubCoverageService } from "./doubles/stub_coverage_service";
import { StubContributorService } from "./doubles/stub_contributor_service";
import { StubDashboardService } from "./doubles/stub_dashboard_service";
import { StubIdentityService } from "./doubles/stub_identity_service";
import { StubIntegrationsService } from "./doubles/stub_integrations_service";
import { StubTimeSeriesService } from "./doubles/stub_time_series_service";

/**
 * Mounts the extension the way a consuming app does — behind a `<Route>` bound
 * to `rootRouteRef` — which is the only way the lazy `import()` of the router
 * actually runs.
 */
const renderPage = (coverageService: StubCoverageService) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [appThemeApiRef, new StubAppThemeApi("light")],
        [codeHealthCoverageApiRef, coverageService],
        [codeHealthConfigApiRef, DEFAULT_CODE_HEALTH_CONFIG],
        [codeHealthRepositoriesApiRef, new StubDashboardService().withRepositories([])],
        [codeHealthContributorsApiRef, new StubContributorService().withContributors([])],
        [codeHealthTimeSeriesApiRef, new StubTimeSeriesService()],
        [codeHealthIntegrationsApiRef, new StubIntegrationsService()],
        [codeHealthIdentitiesApiRef, new StubIdentityService()],
      ]}
    >
      <Routes>
        <Route path="/*" element={<CodeHealthPage />} />
      </Routes>
    </TestApiProvider>,
    { mountedRoutes: { "/*": rootRouteRef } },
  );

describe("CodeHealthPage", () => {
  it("should lazily load the router and render the dashboard", async () => {
    // given
    // The extension loads its router through a dynamic import, which only runs
    // when the page is mounted behind a route bound to its route ref.
    const coverageService = new StubCoverageService();

    // when
    await renderPage(coverageService);

    // then
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Repositories" })).toBeInTheDocument();
    });
  });

  it("should surface a missing backend rather than an empty dashboard", async () => {
    // given
    const coverageService = new StubCoverageService().withError(new Error("404 Not Found"));

    // when
    await renderPage(coverageService);

    // then
    await waitFor(() => {
      expect(screen.getByText(/The Code Health backend is not reachable/)).toBeInTheDocument();
    });
  });
});
