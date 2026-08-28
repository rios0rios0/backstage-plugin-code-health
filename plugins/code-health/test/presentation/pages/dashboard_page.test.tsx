import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { fireEvent, render as renderBare, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../../src/domain/entities/code_health_config";
import type { UseCoverageResult } from "../../../src/presentation/hooks/use_coverage";
import { DashboardPage } from "../../../src/presentation/pages/dashboard_page";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";
import { StubDashboardService } from "../../doubles/stub_dashboard_service";

// The repository table links names to catalog entities through a router `Link`,
// so the page only mounts inside a router — which is how the app renders it.
const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

const coverageResult = (overrides: Partial<UseCoverageResult> = {}): UseCoverageResult => ({
  coverage: aCoverageInfo(),
  isLoading: false,
  error: null,
  reload: async () => undefined,
  ...overrides,
});

describe("DashboardPage", () => {
  it("should render the repositories it fetched", async () => {
    // given
    const service = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("test-repo").build(),
    ]);

    // when
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult()}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
      />,
    );

    // then
    await waitFor(() => expect(screen.getByText("user/test-repo")).toBeInTheDocument());
  });

  it("should display the error a failed fetch carried", async () => {
    // given
    const service = new StubDashboardService().withError(new Error("Server error"));

    // when
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult()}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
      />,
    );

    // then
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });

  it("should render the range picker and the refresh controls", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);

    // when
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult()}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
      />,
    );

    // then
    await waitFor(() => expect(screen.getByText("Refresh")).toBeInTheDocument());
    expect(screen.getByLabelText("Time range")).toBeInTheDocument();
    expect(screen.getByLabelText("Auto refresh interval")).toBeInTheDocument();
  });

  it("should ask for a fresh window when refresh is pressed", async () => {
    // given
    // A window frozen at the instant the range was selected keeps asking for
    // the same period however many times it is refreshed, so the button says
    // the numbers moved when nothing did.
    const service = new StubDashboardService().withRepositories([]);
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult()}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
      />,
    );
    await waitFor(() => expect(service.callCount).toBe(1));

    // when
    fireEvent.click(screen.getByText("Refresh"));

    // then
    await waitFor(() => expect(service.callCount).toBe(2));
    const [first, second] = service.windows;
    expect(Date.parse(second.to)).toBeGreaterThanOrEqual(Date.parse(first.to));
  });

  it("should offer only the ranges the backend has ingested", async () => {
    // given
    // A fresh install has no history, so offering a year would render an empty
    // dashboard that reads as a failure rather than as a backfill still running.
    const service = new StubDashboardService().withRepositories([]);

    // when
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult({ coverage: aCoverageInfo({ earliestDay: null }) })}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
      />,
    );

    // then
    await waitFor(() => expect(screen.getByLabelText("Time range")).toBeInTheDocument());
    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    expect(screen.queryByText("Last 365 days")).not.toBeInTheDocument();
  });

  it("should show backfill progress while history is still being collected", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);

    // when
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult({
          coverage: aCoverageInfo({ backfill: { repositories: 4, complete: 1, percent: 32.5 } }),
        })}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
      />,
    );

    // then
    await waitFor(() =>
      expect(screen.getByText(/Collecting history: 32.5%/)).toBeInTheDocument(),
    );
  });

  it("should not fetch while it is disabled", async () => {
    // given
    const service = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("test-repo").build(),
    ]);

    // when
    render(
      <DashboardPage
        dashboardService={service}
        coverage={coverageResult()}
        config={DEFAULT_CODE_HEALTH_CONFIG}
        capabilities={NO_INTEGRATIONS}
        enabled={false}
      />,
    );

    // then
    await waitFor(() =>
      expect(screen.getByText("No repositories found.")).toBeInTheDocument(),
    );
    expect(service.callCount).toBe(0);
  });
});
