import { renderInTestApp } from "@backstage/test-utils";
import { screen, fireEvent, within } from "@testing-library/react";
import { NO_INTEGRATIONS, type ContributorSummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { ClaudeUsageInsights, ClaudeContributorInsights } from "../../../../src/presentation/components/insights/claude_insights";
import { ContributorsTable } from "../../../../src/presentation/components/contributors_table";
import { claudeTokenSeries, claudeUsageOf } from "../../../../src/domain/entities/claude_insights";
import { rootRouteRef } from "../../../../src/routes";
import { ContributorBuilder } from "../../../builders/contributor_builder";
import { aTrendPoint } from "../../../builders/contributor_trend_builder";

const window = { from: "2026-09-01T00:00:00Z", to: "2026-09-08T00:00:00Z" };
const counts = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 60, cacheCreationTokens: 10 };
const measured = { ...ContributorBuilder.create().withDisplayName("Dev").build(), claudeMetrics: { ...counts, daily: [{ day: "2026-09-01", ...counts }] } };
const empty = ContributorBuilder.create().withKey("missing").withDisplayName("Missing").build();

describe("Claude usage presentation", () => {
  it("should break token trends at unmeasured buckets instead of inventing zeros", () => {
    // given
    const points = [aTrendPoint("2026-09-01", measured), aTrendPoint("2026-09-02", empty)];
    // when
    const series = claudeTokenSeries(points);
    // then
    expect(series).toEqual([
      { day: "2026-09-01", values: { tokens: 190 } },
      { day: "2026-09-02", values: { tokens: null } },
    ]);
  });
  it("should show total and periodic consumption with explicit scoring and time-granularity notes", async () => {
    // given
    const contributors = [measured, empty];
    // when
    await renderInTestApp(<ClaudeUsageInsights contributors={contributors} window={window} fleetDailyTokens={100} />);
    // then
    expect(screen.getByText("Claude Code usage")).toBeInTheDocument();
    expect(screen.getByText("Informational — excluded from productivity scores")).toBeInTheDocument();
    expect(screen.getByText("Per day")).toBeInTheDocument();
    expect(screen.getByText("Per week")).toBeInTheDocument();
    expect(screen.getByText("Per month")).toBeInTheDocument();
    expect(screen.getByText("27.1")).toBeInTheDocument();
    expect(screen.getByText(/1 measured accounts or linked people/u)).toBeInTheDocument();
    expect(screen.getByText(/not individual hours/u)).toBeInTheDocument();
    expect(screen.getByText(/Team average per measured person: 100 tokens\/day/u)).toBeInTheDocument();
  });

  it("should show uncollected usage as missing and preserve a measured zero", async () => {
    // given
    const zero = { ...measured, claudeMetrics: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, daily: [] } };
    // when
    await renderInTestApp(<ClaudeUsageInsights contributors={[empty]} window={window} />);
    // then
    expect(screen.getAllByText("—")).toHaveLength(8);
    expect(claudeUsageOf([zero]).metrics?.inputTokens).toBe(0);
    expect(claudeTokenSeries([])).toEqual([]);
  });

  it("should link consumption rankings to each person", async () => {
    // given
    const contributors = [empty, measured];
    // when
    await renderInTestApp(<ClaudeContributorInsights contributors={contributors} />, { mountedRoutes: { "/": rootRouteRef } });
    // then
    expect(screen.getByRole("link", { name: "Dev" })).toHaveAttribute("href", expect.stringContaining("contributor"));
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
  });

  it("should hide disabled columns and offer filtering and sorting when enabled", async () => {
    // given
    const contributors: ContributorSummary[] = [measured, empty];
    const props = { contributors, totalCount: 2, isLoading: false, window };
    const view = await renderInTestApp(<ContributorsTable {...props} capabilities={NO_INTEGRATIONS} />, { mountedRoutes: { "/": rootRouteRef } });
    expect(screen.queryByText("Claude tokens")).not.toBeInTheDocument();
    // when
    view.rerender(<ContributorsTable {...props} capabilities={{ ...NO_INTEGRATIONS, claude: true }} />);
    // then
    expect(screen.getByText("Claude tokens")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("190")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Claude tokens"));
    expect(within(table).getByText("Dev")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter claudeTokens"), { target: { value: "190" } });
    expect(within(table).queryByText("Missing")).not.toBeInTheDocument();
    expect(within(table).getByText("Dev")).toBeInTheDocument();
  });
});
