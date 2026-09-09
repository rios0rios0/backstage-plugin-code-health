import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { renderInTestApp } from "@backstage/test-utils";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../../src/domain/entities/code_health_config";
import type { UseCoverageResult } from "../../../src/presentation/hooks/use_coverage";
import { ContributorsPage } from "../../../src/presentation/pages/contributors_page";
import { rootRouteRef } from "../../../src/routes";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { StubContributorService } from "../../doubles/stub_contributor_service";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";
import { StubDashboardService } from "../../doubles/stub_dashboard_service";

const coverageResult = (overrides: Partial<UseCoverageResult> = {}): UseCoverageResult => ({
  coverage: aCoverageInfo(),
  isLoading: false,
  error: null,
  reload: async () => undefined,
  ...overrides,
});

/**
 * The rankings above the table resolve their links through `useRouteRef`, which
 * needs the plugin root mounted — a bare `render` leaves the route refs with no
 * path to give and the page throws before it draws anything.
 */
const renderPage = (
  service: StubContributorService,
  overrides: { dashboardService?: StubDashboardService; enabled?: boolean } = {},
) => {
  const dashboardService = overrides.dashboardService ?? new StubDashboardService();

  return renderInTestApp(
    <ContributorsPage
      contributorService={service}
      dashboardService={dashboardService}
      coverage={coverageResult()}
      config={DEFAULT_CODE_HEALTH_CONFIG}
      capabilities={NO_INTEGRATIONS}
      enabled={overrides.enabled ?? true}
    />,
    { mountedRoutes: { "/": rootRouteRef } },
  );
};

describe("ContributorsPage", () => {
  it("should render the contributors it fetched", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").build(),
    ]);

    // when
    await renderPage(service);

    // then
    await waitFor(() => expect(screen.getAllByText("alice").length).toBeGreaterThan(0));
  });

  it("should display the error a failed fetch carried", async () => {
    // given
    const service = new StubContributorService().withError(new Error("Server error"));

    // when
    await renderPage(service);

    // then
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });

  it("should refetch with the newly selected range", async () => {
    // given
    // The range picker in the toolbar is the only control over the window now;
    // the table's own date inputs are gone.
    const service = new StubContributorService().withContributors([]);
    await renderPage(service);
    await waitFor(() => expect(service.calls).toHaveLength(1));

    // when
    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "month" } });

    // then
    await waitFor(() => expect(service.calls.length).toBeGreaterThan(1));
    const [first, latest] = [service.calls[0], service.calls[service.calls.length - 1]];
    expect(Date.parse(latest.window.from)).toBeLessThan(Date.parse(first.window.from));
  });

  it("should not fetch while it is disabled", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").build(),
    ]);
    const dashboardService = new StubDashboardService();

    // when
    await renderPage(service, { dashboardService, enabled: false });

    // then
    await waitFor(() =>
      expect(screen.getByText("No contributors found.")).toBeInTheDocument(),
    );
    expect(service.calls).toEqual([]);
    expect(dashboardService.callCount).toBe(0);
  });
});

describe("ContributorsPage rankings", () => {
  it("should rank people and repositories over the table's own window", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").withCommits(30).build(),
    ]);
    const dashboardService = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").withActivity({ commits: 9 }).build(),
    ]);

    // when
    await renderPage(service, { dashboardService });

    // then
    await waitFor(() => expect(screen.getByText("Top contributors")).toBeInTheDocument());
    expect(screen.getByText("Review load")).toBeInTheDocument();
    expect(screen.getByText("Most active repositories")).toBeInTheDocument();
    expect(screen.getByLabelText(/^alice: 30 commits/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/^gateway: 9 commits/u)).toBeInTheDocument();
    // Both requests describe the same period, or the cards and the table would
    // be answering about different weeks under one range picker.
    const [contributorCall] = service.calls;
    const [repositoryWindow] = dashboardService.windows;
    expect(repositoryWindow).toEqual(contributorCall.window);
  });

  it("should keep the contributors when the repository ranking's fetch fails", async () => {
    // given
    // The table is the tab's subject; losing the page over a card that could not
    // be filled trades the whole view for a corner of it.
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").withCommits(30).build(),
    ]);
    const dashboardService = new StubDashboardService().withError(new Error("Server error"));

    // when
    await renderPage(service, { dashboardService });

    // then
    await waitFor(() =>
      expect(
        screen.getByText("Repositories could not be loaded: Server error"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/^alice: 30 commits/u)).toBeInTheDocument();
    expect(screen.queryByText("Failed to load contributors")).not.toBeInTheDocument();
  });
});
