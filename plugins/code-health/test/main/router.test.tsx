import { screen, waitFor } from "@testing-library/react";
import { appThemeApiRef } from "@backstage/core-plugin-api";
import { renderInTestApp, TestApiProvider } from "@backstage/test-utils";
import { Router } from "../../src/main/router";
import {
  codeHealthAuthApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthRepositoriesApiRef,
} from "../../src/main/api_refs";
import type { CodeHealthConfig } from "../../src/domain/entities/code_health_config";
import { aCodeHealthConfig } from "../builders/code_health_config_builder";
import { RepositoryBuilder } from "../builders/repository_builder";
import { StubAppThemeApi } from "../doubles/stub_app_theme_api";
import { StubAsyncAuthenticationService } from "../doubles/stub_async_authentication_service";
import { StubContributorService } from "../doubles/stub_contributor_service";
import { StubDashboardService } from "../doubles/stub_dashboard_service";

interface RenderOptions {
  authService?: StubAsyncAuthenticationService;
  config?: CodeHealthConfig;
  dashboardService?: StubDashboardService;
  contributorService?: StubContributorService;
}

const renderRouter = ({
  authService = new StubAsyncAuthenticationService(),
  config = aCodeHealthConfig(),
  dashboardService = new StubDashboardService().withRepositories([]),
  contributorService = new StubContributorService().withContributors([]),
}: RenderOptions = {}) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [appThemeApiRef, new StubAppThemeApi("light")],
        [codeHealthAuthApiRef, authService],
        [codeHealthConfigApiRef, config],
        [codeHealthRepositoriesApiRef, dashboardService],
        [codeHealthContributorsApiRef, contributorService],
      ]}
    >
      <Router />
    </TestApiProvider>,
  );

/** Credential store that is already unlocked and holds a usable GitHub token. */
const configuredAuthService = () => {
  const authService = new StubAsyncAuthenticationService();
  authService.setToken("ghp_token");
  authService.setUsername("acme");
  authService.setPlatform("github");
  return authService;
};

describe("Router", () => {
  it("should show a progress indicator while the credential store is unlocking", async () => {
    // given
    let unlock = () => {};
    const readiness = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    // when
    await renderRouter({ authService: new StubAsyncAuthenticationService(readiness) });

    // then
    expect(screen.getByTestId("progress")).toBeInTheDocument();
    expect(screen.queryByText("Connect Code Health")).not.toBeInTheDocument();
    unlock();
  });

  it("should show the connect form when no credentials are stored", async () => {
    // given / when
    await renderRouter();

    // then
    await waitFor(() => {
      expect(screen.getByText("Connect Code Health")).toBeInTheDocument();
    });
    expect(screen.getByText("Not configured yet")).toBeInTheDocument();
  });

  it("should render the three dashboard tabs once credentials are stored", async () => {
    // given / when
    await renderRouter({ authService: configuredAuthService() });

    // then
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Repositories" })).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Contributors" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
  });

  it("should label the header with the GitHub platform", async () => {
    // given / when
    await renderRouter({ authService: configuredAuthService() });

    // then
    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });
  });

  it("should label the header with Azure DevOps when that platform is stored", async () => {
    // given
    const authService = configuredAuthService();
    authService.setPlatform("azure-devops");

    // when
    await renderRouter({ authService });

    // then
    await waitFor(() => {
      expect(screen.getByText("Azure DevOps")).toBeInTheDocument();
    });
  });

  it("should show the organization pinned in app-config as the header subtitle", async () => {
    // given
    const config = aCodeHealthConfig({ platform: "github", organization: "pinned-org" });

    // when
    await renderRouter({
      authService: configuredAuthService(),
      config,
    });

    // then
    await waitFor(() => {
      expect(screen.getByText("pinned-org")).toBeInTheDocument();
    });
  });

  it("should list the repositories the dashboard service returns", async () => {
    // given
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("router-repo").build(),
    ]);

    // when
    await renderRouter({ authService: configuredAuthService(), dashboardService });

    // then
    await waitFor(() => {
      expect(screen.getByText("user/router-repo")).toBeInTheDocument();
    });
  });

  it("should fall back to GitHub when no platform has been chosen", async () => {
    // given
    const authService = new StubAsyncAuthenticationService();
    authService.setToken("ghp_token");
    authService.setUsername("acme");

    // when
    await renderRouter({ authService });

    // then
    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });
  });

  it("should leave the subtitle empty when no organization is known", async () => {
    // given
    const authService = new StubAsyncAuthenticationService();
    authService.setToken("ghp_token");
    authService.setPlatform("github");
    const config = aCodeHealthConfig({ platform: "github", organization: "acme" });

    // when
    await renderRouter({ authService, config });

    // then
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    });
    expect(screen.getByText("acme")).toBeInTheDocument();
  });
});
