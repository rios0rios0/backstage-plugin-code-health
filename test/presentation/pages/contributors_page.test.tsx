import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContributorsPage } from "../../../src/presentation/pages/contributors_page";
import { StubContributorService } from "../../doubles/stub_contributor_service";
import { ContributorBuilder } from "../../builders/contributor_builder";

describe("ContributorsPage", () => {
  it("should render ContributorsTable with fetched contributors", async () => {
    // given
    const contributors = [ContributorBuilder.create().withUsername("alice").build()];
    const service = new StubContributorService().withContributors(contributors);

    // when
    render(<ContributorsPage contributorService={service} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  it("should display error message when fetch fails", async () => {
    // given
    const service = new StubContributorService().withError(new Error("Auth failed"));

    // when
    render(<ContributorsPage contributorService={service} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("Auth failed")).toBeInTheDocument();
    });
  });

  it("should refetch with the selected date range when Apply is clicked", async () => {
    // given
    const contributors = [ContributorBuilder.create().withUsername("alice").build()];
    const service = new StubContributorService().withContributors(contributors);
    render(<ContributorsPage contributorService={service} />);
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Date from"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Date to"), { target: { value: "2026-02-01" } });

    // when
    fireEvent.click(screen.getByText("Apply"));

    // then
    await waitFor(() => {
      expect(service.calls).toContainEqual({ dateFrom: "2026-01-01", dateTo: "2026-02-01" });
    });
  });

  it("should not fetch when disabled", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withUsername("alice").build(),
    ]);

    // when
    render(<ContributorsPage contributorService={service} enabled={false} />);

    // then
    await waitFor(() => {
      expect(screen.getByText("No contributors found.")).toBeInTheDocument();
    });
    expect(service.calls).toHaveLength(0);
  });
});
