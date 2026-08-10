import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { appThemeApiRef } from "@backstage/core-plugin-api";
import { renderInTestApp, TestApiProvider } from "@backstage/test-utils";
import { CodeHealthPage } from "../src/plugin";
import { rootRouteRef } from "../src/routes";
import {
  codeHealthAuthApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthRepositoriesApiRef,
} from "../src/main/api_refs";
import { aCodeHealthConfig } from "./builders/code_health_config_builder";
import { StubAppThemeApi } from "./doubles/stub_app_theme_api";
import { StubAsyncAuthenticationService } from "./doubles/stub_async_authentication_service";
import { StubContributorService } from "./doubles/stub_contributor_service";
import { StubDashboardService } from "./doubles/stub_dashboard_service";

/**
 * Mounts the extension the way a consuming app does — behind a `<Route>` bound
 * to `rootRouteRef` — which is the only way the lazy `import()` of the router
 * actually runs.
 */
const renderPage = (authService: StubAsyncAuthenticationService) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [appThemeApiRef, new StubAppThemeApi("light")],
        [codeHealthAuthApiRef, authService],
        [codeHealthConfigApiRef, aCodeHealthConfig()],
        [codeHealthRepositoriesApiRef, new StubDashboardService().withRepositories([])],
        [codeHealthContributorsApiRef, new StubContributorService().withContributors([])],
      ]}
    >
      <Routes>
        <Route path="/*" element={<CodeHealthPage />} />
      </Routes>
    </TestApiProvider>,
    { mountedRoutes: { "/*": rootRouteRef } },
  );

describe("CodeHealthPage", () => {
  it("should lazily load the router and ask for credentials when none are stored", async () => {
    // given
    const authService = new StubAsyncAuthenticationService();

    // when
    await renderPage(authService);

    // then
    await waitFor(() => {
      expect(screen.getByText("Connect Code Health")).toBeInTheDocument();
    });
  });

  it("should lazily load the router and show the dashboard once credentials exist", async () => {
    // given
    const authService = new StubAsyncAuthenticationService();
    authService.setToken("ghp_token");
    authService.setUsername("acme");
    authService.setPlatform("github");

    // when
    await renderPage(authService);

    // then
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Repositories" })).toBeInTheDocument();
    });
  });
});
