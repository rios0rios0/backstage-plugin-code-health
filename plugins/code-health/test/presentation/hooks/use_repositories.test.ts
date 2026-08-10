import type { TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRepositories } from "../../../src/presentation/hooks/use_repositories";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { StubDashboardService } from "../../doubles/stub_dashboard_service";

const WINDOW: TimeWindow = {
  from: "2026-08-09T12:00:00.000Z",
  to: "2026-08-10T12:00:00.000Z",
};

describe("useRepositories", () => {
  it("should load repositories for the requested window on mount", async () => {
    // given
    const service = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().withName("gateway").build(),
    ]);

    // when
    const { result } = renderHook(() => useRepositories(service, WINDOW, true));

    // then
    await waitFor(() => expect(result.current.repositories).toHaveLength(1));
    expect(service.windows).toEqual([WINDOW]);
    expect(result.current.lastFetchedAt).not.toBeNull();
  });

  it("should not fetch while it is disabled", async () => {
    // given
    // The page holds this off until the coverage probe has answered, so a
    // dashboard with no backend does not fire a request that can only fail.
    const service = new StubDashboardService();

    // when
    renderHook(() => useRepositories(service, WINDOW, false));

    // then
    await waitFor(() => expect(service.callCount).toBe(0));
  });

  it("should surface the message a failed request carried", async () => {
    // given
    const service = new StubDashboardService().withError(
      new Error("the requested window is longer than the retention period"),
    );

    // when
    const { result } = renderHook(() => useRepositories(service, WINDOW, true));

    // then
    await waitFor(() =>
      expect(result.current.error).toBe(
        "the requested window is longer than the retention period",
      ),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it("should refetch on demand", async () => {
    // given
    const service = new StubDashboardService();
    const { result } = renderHook(() => useRepositories(service, WINDOW, true));
    await waitFor(() => expect(service.callCount).toBe(1));

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(service.callCount).toBe(2);
  });

  it("should fetch again when the window changes", async () => {
    // given
    const service = new StubDashboardService();
    const { rerender } = renderHook(
      ({ window }: { window: TimeWindow }) => useRepositories(service, window, true),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(service.callCount).toBe(1));

    // when
    const wider: TimeWindow = { from: "2026-07-10T12:00:00.000Z", to: WINDOW.to };
    rerender({ window: wider });

    // then
    await waitFor(() => expect(service.windows).toEqual([WINDOW, wider]));
  });

  it("should clear a previous error once a later request succeeds", async () => {
    // given
    const service = new StubDashboardService().withError(new Error("boom"));
    const { result } = renderHook(() => useRepositories(service, WINDOW, true));
    await waitFor(() => expect(result.current.error).toBe("boom"));

    // when
    const healthy = new StubDashboardService().withRepositories([
      RepositoryBuilder.create().build(),
    ]);
    Object.assign(service, healthy);
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(result.current.error).toBeNull();
  });
  it("should ignore a reply for a window the user has already moved on from", async () => {
    // given
    // Two windows in flight resolve in whatever order the network decides. The
    // stale one must not overwrite what is on screen, or a user who widened the
    // range briefly sees the narrower result win.
    const service = new StubDashboardService();
    let releaseFirst: (() => void) | undefined;
    const firstReply = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    let call = 0;
    service.listRepositories = async () => {
      call += 1;
      if (call === 1) {
        await firstReply;
        return [RepositoryBuilder.create().withName("stale").build()];
      }
      return [RepositoryBuilder.create().withName("fresh").build()];
    };

    const { result } = renderHook(() => useRepositories(service, WINDOW, true));

    // when
    await act(async () => {
      // The second request overtakes the first, then the first finally answers.
      await result.current.refetch();
      releaseFirst?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // then
    expect(result.current.repositories.map((repository) => repository.name)).toEqual(["fresh"]);
  });

  it("should ignore a failure for a window the user has already moved on from", async () => {
    // given
    const service = new StubDashboardService().withRepositories([]);
    let firstCall = true;
    service.listRepositories = async () => {
      if (firstCall) {
        firstCall = false;
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("stale failure");
      }
      return [];
    };
    const { result } = renderHook(() => useRepositories(service, WINDOW, true));

    // when
    await act(async () => {
      await result.current.refetch();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // then
    expect(result.current.error).toBeNull();
  });
});
