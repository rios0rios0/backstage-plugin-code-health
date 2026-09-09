import type { TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useOwnedRepositories } from "../../../src/presentation/hooks/use_owned_repositories";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { StubOwnershipService } from "../../doubles/stub_ownership_service";

const KEY = "user:default/jane";

const WINDOW: TimeWindow = {
  from: "2026-06-09T12:00:00.000Z",
  to: "2026-09-09T12:00:00.000Z",
};

describe("useOwnedRepositories", () => {
  it("should read what the person owns over the requested window", async () => {
    // given
    const service = new StubOwnershipService()
      .withOwnership("user:default/jane", ["user:default/jane", "group:default/platform"])
      .withRepositories([RepositoryBuilder.create().withName("gateway").build()]);

    // when
    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));

    // then
    await waitFor(() => expect(result.current.repositories).toHaveLength(1));
    expect(result.current.ownership?.owners).toEqual([
      "user:default/jane",
      "group:default/platform",
    ]);
    expect(service.calls).toEqual([{ key: KEY, window: WINDOW }]);
  });

  it("should keep the ownership answer beside an empty list", async () => {
    // given
    // An empty list means three different things, and only the ownership half
    // of the answer tells them apart.
    const service = new StubOwnershipService().withOwnership(null, []);

    // when
    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));

    // then
    await waitFor(() => expect(result.current.ownership).not.toBeNull());
    expect(result.current.ownership?.entityRef).toBeNull();
    expect(result.current.repositories).toEqual([]);
  });

  it("should ask for nothing when the page was opened without a key", async () => {
    // given
    const service = new StubOwnershipService();

    // when
    const { result } = renderHook(() => useOwnedRepositories(service, null, WINDOW));

    // then
    await waitFor(() => expect(service.calls).toEqual([]));
    expect(result.current.ownership).toBeNull();
  });

  it("should surface the message a failed request carried", async () => {
    // given
    const service = new StubOwnershipService().withError(new Error("catalog is down"));

    // when
    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));

    // then
    await waitFor(() => expect(result.current.error).toBe("catalog is down"));
  });

  it("should read again when the range moves", async () => {
    // given
    // Ownership does not move with the window, but the rows are summaries whose
    // health is measured over it.
    const service = new StubOwnershipService();
    const { rerender } = renderHook(
      ({ window }: { window: TimeWindow }) => useOwnedRepositories(service, KEY, window),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(service.calls).toHaveLength(1));

    // when
    const wider: TimeWindow = { from: "2026-03-09T12:00:00.000Z", to: WINDOW.to };
    rerender({ window: wider });

    // then
    await waitFor(() =>
      expect(service.calls.map((call) => call.window)).toEqual([WINDOW, wider]),
    );
  });

  it("should read again on demand", async () => {
    // given
    const service = new StubOwnershipService();
    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));
    await waitFor(() => expect(service.calls).toHaveLength(1));

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(service.calls).toHaveLength(2);
  });

  it("should ignore a reply for a range the reader has already moved on from", async () => {
    // given
    const service = new StubOwnershipService();
    let releaseFirst: (() => void) | undefined;
    const firstReply = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    let call = 0;
    service.listOwnedRepositories = async (_key, window) => {
      call += 1;
      const name = call === 1 ? "stale" : "fresh";
      if (call === 1) await firstReply;
      return {
        window,
        ownership: { entityRef: "user:default/jane", owners: [] },
        items: [RepositoryBuilder.create().withName(name).build()],
      };
    };

    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));

    // when
    await act(async () => {
      await result.current.refetch();
      releaseFirst?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // then
    expect(result.current.repositories.map((item) => item.name)).toEqual(["fresh"]);
  });

  it("should ignore a failure for a range the reader has already moved on from", async () => {
    // given
    const service = new StubOwnershipService();
    let call = 0;
    service.listOwnedRepositories = async (_key, window) => {
      call += 1;
      if (call === 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("stale failure");
      }
      return { window, ownership: { entityRef: null, owners: [] }, items: [] };
    };
    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));

    // when
    await act(async () => {
      await result.current.refetch();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // then
    expect(result.current.error).toBeNull();
  });

  it("should report a failure that carried no message at all", async () => {
    // given
    const service = new StubOwnershipService();
    // Rejected with a bare string rather than thrown, because a rejection is
    // exactly what a `fetch` layer produces and nothing guarantees it carries
    // an `Error`.
    service.listOwnedRepositories = () => Promise.reject("boom");

    // when
    const { result } = renderHook(() => useOwnedRepositories(service, KEY, WINDOW));

    // then
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to fetch the owned repositories"),
    );
  });
});
