import type {
  GetContributorTrendResponse,
  GetRepositoryTrendResponse,
  TimeSeriesBucket,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { TrendService } from "../../../src/domain/services/dashboard_service";
import { useRepositoryTrend } from "../../../src/presentation/hooks/use_repository_trend";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { aRepositoryTrend, StubTrendService } from "../../doubles/stub_trend_service";

const WINDOW: TimeWindow = {
  from: "2026-06-09T00:00:00.000Z",
  to: "2026-09-09T00:00:00.000Z",
};

const WIDER: TimeWindow = { from: "2026-03-09T00:00:00.000Z", to: WINDOW.to };

const aTrackedRepository = () =>
  new StubTrendService().withRepositoryTrend(
    aRepositoryTrend({
      summary: RepositoryBuilder.create().withId("repo-1").withName("gateway").build(),
    }),
  );

/** A trend service that hands out replies only when a test says so. */
class DeferredTrendService implements TrendService {
  readonly pending: Array<{
    resolve: (response: GetRepositoryTrendResponse) => void;
    reject: (reason: unknown) => void;
  }> = [];

  async getContributorTrend(): Promise<GetContributorTrendResponse> {
    throw new Error("not used by these tests");
  }

  getRepositoryTrend(): Promise<GetRepositoryTrendResponse> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  resolve(index: number, response: GetRepositoryTrendResponse): void {
    this.pending[index].resolve(response);
  }

  fail(index: number, reason: unknown): void {
    this.pending[index].reject(reason);
  }
}

describe("useRepositoryTrend", () => {
  it("should load the repository's trend for the requested window on mount", async () => {
    // given
    const service = aTrackedRepository();

    // when
    const { result } = renderHook(() =>
      useRepositoryTrend(service, "repo-1", WINDOW, "week", true),
    );

    // then
    await waitFor(() => expect(result.current.trend?.summary.name).toBe("gateway"));
    expect(service.repositoryCalls).toEqual([
      { id: "repo-1", window: WINDOW, bucket: "week" },
    ]);
  });

  it("should not fetch while it is disabled", async () => {
    // given
    const service = aTrackedRepository();

    // when
    renderHook(() => useRepositoryTrend(service, "repo-1", WINDOW, "week", false));

    // then
    await waitFor(() => expect(service.repositoryCalls).toEqual([]));
  });

  it("should not fetch when no repository was named", async () => {
    // given
    // The route matched with no `:id`, which is a bad link rather than a fault
    // worth asking the backend about.
    const service = aTrackedRepository();

    // when
    renderHook(() => useRepositoryTrend(service, null, WINDOW, "week", true));

    // then
    await waitFor(() => expect(service.repositoryCalls).toEqual([]));
  });

  it("should fetch again when the window widens", async () => {
    // given
    const service = aTrackedRepository();
    const { rerender } = renderHook(
      ({ window }: { window: TimeWindow }) =>
        useRepositoryTrend(service, "repo-1", window, "week", true),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(service.repositoryCalls).toHaveLength(1));

    // when
    rerender({ window: WIDER });

    // then
    await waitFor(() =>
      expect(service.repositoryCalls.map((call) => call.window)).toEqual([WINDOW, WIDER]),
    );
  });

  it("should surface the message a failed request carried", async () => {
    // given
    const service = new StubTrendService().withError(new Error("500 Internal Server Error"));

    // when
    const { result } = renderHook(() =>
      useRepositoryTrend(service, "repo-1", WINDOW, "week", true),
    );

    // then
    await waitFor(() => expect(result.current.error).toBe("500 Internal Server Error"));
    expect(result.current.isMissing).toBe(false);
  });

  it("should read a 404 as an untracked repository rather than as a failure", async () => {
    // given
    // A bookmark outliving a catalog entity is ordinary. "This repository is not
    // tracked" and "the backend is broken" call for completely different words.
    const service = new StubTrendService();

    // when
    const { result } = renderHook(() =>
      useRepositoryTrend(service, "gone", WINDOW, "week", true),
    );

    // then
    await waitFor(() => expect(result.current.isMissing).toBe(true));
    expect(result.current.error).toBe("no repository with id gone");
  });

  it("should drop the row it was showing when a later window fails", async () => {
    // given
    // A stale row left under the warning would read as though the failed range
    // had been answered.
    const service = aTrackedRepository();
    const { result, rerender } = renderHook(
      ({ window }: { window: TimeWindow }) =>
        useRepositoryTrend(service, "repo-1", window, "week", true),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(result.current.trend).not.toBeNull());

    // when
    service.withError(new Error("boom"));
    rerender({ window: WIDER });

    // then
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.trend).toBeNull();
  });

  it("should refetch on demand", async () => {
    // given
    const service = aTrackedRepository();
    const { result } = renderHook(() =>
      useRepositoryTrend(service, "repo-1", WINDOW, "week", true),
    );
    await waitFor(() => expect(service.repositoryCalls).toHaveLength(1));

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(service.repositoryCalls).toHaveLength(2);
  });

  it("should fetch again when a narrower range changes the bucket", async () => {
    // given
    const service = aTrackedRepository();
    const initialProps: { bucket: TimeSeriesBucket } = { bucket: "week" };
    const { result, rerender } = renderHook(
      ({ bucket }: { bucket: TimeSeriesBucket }) =>
        useRepositoryTrend(service, "repo-1", WINDOW, bucket, true),
      { initialProps },
    );
    await waitFor(() => expect(result.current.trend?.bucket).toBe("week"));

    // when
    rerender({ bucket: "day" });

    // then
    await waitFor(() => expect(result.current.trend?.bucket).toBe("day"));
    expect(result.current.isLoading).toBe(false);
  });

  it("should report something thrown that is not an error at all", async () => {
    // given
    // A rejection carrying a bare string still has to reach the screen as
    // words rather than as `[object Object]`.
    const service = new DeferredTrendService();
    const { result } = renderHook(() =>
      useRepositoryTrend(service, "repo-1", WINDOW, "week", true),
    );
    await waitFor(() => expect(service.pending).toHaveLength(1));

    // when
    await act(async () => {
      service.fail(0, "the gateway went away");
    });

    // then
    expect(result.current.error).toBe("the gateway went away");
    expect(result.current.isMissing).toBe(false);
  });

  it("should ignore a failure for a window the user has already moved on from", async () => {
    // given
    // The stale request is the one that fails, so its message must not land on
    // top of the answer the user is actually looking at.
    const service = new DeferredTrendService();
    const { result, rerender } = renderHook(
      ({ window }: { window: TimeWindow }) =>
        useRepositoryTrend(service, "repo-1", window, "week", true),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(service.pending).toHaveLength(1));
    rerender({ window: WIDER });
    await waitFor(() => expect(service.pending).toHaveLength(2));

    // when
    await act(async () => {
      service.resolve(1, aRepositoryTrend({ id: "wider" }));
      service.fail(0, new Error("the narrow window blew up"));
    });

    // then
    expect(result.current.error).toBeNull();
    expect(result.current.trend?.id).toBe("wider");
  });

  it("should ignore a reply for a window the user has already moved on from", async () => {
    // given
    // Flipping the range twice quickly leaves two requests in flight, and the
    // first one is free to land last. Hand-rolled rather than a shared double,
    // because holding a reply open is the entire point of it.
    const service = new DeferredTrendService();
    const { result, rerender } = renderHook(
      ({ window }: { window: TimeWindow }) =>
        useRepositoryTrend(service, "repo-1", window, "week", true),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(service.pending).toHaveLength(1));
    rerender({ window: WIDER });
    await waitFor(() => expect(service.pending).toHaveLength(2));

    // when
    // The second window answers first, then the first one finally arrives.
    await act(async () => {
      service.resolve(1, aRepositoryTrend({ id: "wider" }));
      service.resolve(0, aRepositoryTrend({ id: "narrower" }));
    });

    // then
    expect(result.current.trend?.id).toBe("wider");
  });
});
