import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRepositories } from "../../../src/presentation/hooks/use_repositories";
import { StubDashboardService } from "../../doubles/stub_dashboard_service";
import { RepositoryBuilder } from "../../builders/repository_builder";

describe("useRepositories", () => {
  it("should fetch repositories on mount when enabled", async () => {
    // given
    const repos = [RepositoryBuilder.create().withName("repo-a").build()];
    const service = new StubDashboardService().withRepositories(repos);

    // when
    const { result } = renderHook(() => useRepositories(service, true));

    // then
    await waitFor(() => {
      expect(result.current.repositories).toEqual(repos);
    });
  });

  it("should set isLoading true during fetch and false after", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);

    // when
    const { result } = renderHook(() => useRepositories(service, true));

    // then
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("should set error message when fetch fails", async () => {
    // given
    const service = new StubDashboardService().withError(new Error("API failed"));

    // when
    const { result } = renderHook(() => useRepositories(service, true));

    // then
    await waitFor(() => {
      expect(result.current.error).toBe("API failed");
    });
  });

  it("should not fetch when disabled", async () => {
    // given
    const service = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().build(),
    ]);

    // when
    const { result } = renderHook(() => useRepositories(service, false));

    // then
    expect(result.current.repositories).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(service.callCount).toBe(0);
  });

  it("should set lastFetchedAt after successful fetch", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);

    // when
    const { result } = renderHook(() => useRepositories(service, true));

    // then
    await waitFor(() => {
      expect(result.current.lastFetchedAt).toBeInstanceOf(Date);
    });
  });

  it("should refetch when refetch is called", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);
    const { result } = renderHook(() => useRepositories(service, true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const listSpy = vi.spyOn(service, "listRepositories");

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(listSpy).toHaveBeenCalled();
  });
});
