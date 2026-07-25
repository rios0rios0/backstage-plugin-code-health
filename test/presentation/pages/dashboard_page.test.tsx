import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DashboardPage } from "../../../src/presentation/pages/dashboard_page";
import { StubDashboardService } from "../../doubles/stub_dashboard_service";
import { RepositoryBuilder } from "../../builders/repository_builder";

describe("DashboardPage", () => {
  it("should render RepositoryTable with fetched repositories", async () => {
    // given
    const repos = [RepositoryBuilder.create().withName("test-repo").build()];
    const service = new StubDashboardService().withRepositories(repos);

    // when
    render(<DashboardPage dashboardService={service} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("user/test-repo")).toBeInTheDocument();
    });
  });

  it("should display error message when fetch fails", async () => {
    // given
    const service = new StubDashboardService().withError(new Error("Server error"));

    // when
    render(<DashboardPage dashboardService={service} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("should render the refresh controls", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);

    // when
    render(<DashboardPage dashboardService={service} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Auto refresh interval")).toBeInTheDocument();
  });

  it("should not fetch when disabled", async () => {
    // given
    const service = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("test-repo").build(),
    ]);

    // when
    render(<DashboardPage dashboardService={service} enabled={false} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("No repositories found.")).toBeInTheDocument();
    });
    expect(service.callCount).toBe(0);
  });
});
