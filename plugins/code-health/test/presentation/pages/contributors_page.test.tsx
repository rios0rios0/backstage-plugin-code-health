import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_CODE_HEALTH_CONFIG } from "../../../src/domain/entities/code_health_config";
import type { UseCoverageResult } from "../../../src/presentation/hooks/use_coverage";
import { ContributorsPage } from "../../../src/presentation/pages/contributors_page";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { StubContributorService } from "../../doubles/stub_contributor_service";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";

const coverageResult = (overrides: Partial<UseCoverageResult> = {}): UseCoverageResult => ({
  coverage: aCoverageInfo(),
  isLoading: false,
  error: null,
  reload: async () => undefined,
  ...overrides,
});

const renderPage = (service: StubContributorService, enabled = true) =>
  render(
    <ContributorsPage
      contributorService={service}
      coverage={coverageResult()}
      config={DEFAULT_CODE_HEALTH_CONFIG}
      capabilities={NO_INTEGRATIONS}
      enabled={enabled}
    />,
  );

describe("ContributorsPage", () => {
  it("should render the contributors it fetched", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").build(),
    ]);

    // when
    renderPage(service);

    // then
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
  });

  it("should display the error a failed fetch carried", async () => {
    // given
    const service = new StubContributorService().withError(new Error("Server error"));

    // when
    renderPage(service);

    // then
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });

  it("should refetch with the newly selected range", async () => {
    // given
    // The range picker in the toolbar is the only control over the window now;
    // the table's own date inputs are gone.
    const service = new StubContributorService().withContributors([]);
    renderPage(service);
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

    // when
    renderPage(service, false);

    // then
    await waitFor(() =>
      expect(screen.getByText("No contributors found.")).toBeInTheDocument(),
    );
    expect(service.calls).toEqual([]);
  });
});
