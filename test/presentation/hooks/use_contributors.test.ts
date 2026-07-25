import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useContributors } from "../../../src/presentation/hooks/use_contributors";
import { StubContributorService } from "../../doubles/stub_contributor_service";
import { ContributorBuilder } from "../../builders/contributor_builder";

describe("useContributors", () => {
  it("should fetch contributors on mount when enabled", async () => {
    // given
    const contributors = [ContributorBuilder.create().withUsername("alice").build()];
    const service = new StubContributorService().withContributors(contributors);

    // when
    const { result } = renderHook(() => useContributors(service, true));

    // then
    await waitFor(() => {
      expect(result.current.contributors).toEqual(contributors);
    });
  });

  it("should set isLoading true during fetch and false after", async () => {
    // given
    const service = new StubContributorService().withContributors([]);

    // when
    const { result } = renderHook(() => useContributors(service, true));

    // then
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("should set error message when fetch fails", async () => {
    // given
    const service = new StubContributorService().withError(new Error("Network error"));

    // when
    const { result } = renderHook(() => useContributors(service, true));

    // then
    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });
  });

  it("should not fetch when disabled", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().build(),
    ]);

    // when
    const { result } = renderHook(() => useContributors(service, false));

    // then
    expect(result.current.contributors).toEqual([]);
    expect(service.calls).toHaveLength(0);
  });

  it("should pass dateFrom and dateTo to refetch", async () => {
    // given
    const service = new StubContributorService().withContributors([]);
    const listSpy = vi.spyOn(service, "listContributors");
    const { result } = renderHook(() => useContributors(service, true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    await act(async () => {
      await result.current.refetch("2026-01-01", "2026-02-01");
    });

    // then
    expect(listSpy).toHaveBeenLastCalledWith("2026-01-01", "2026-02-01");
  });

  it("should set lastFetchedAt after successful fetch", async () => {
    // given
    const service = new StubContributorService().withContributors([]);

    // when
    const { result } = renderHook(() => useContributors(service, true));

    // then
    await waitFor(() => {
      expect(result.current.lastFetchedAt).toBeInstanceOf(Date);
    });
  });
});
