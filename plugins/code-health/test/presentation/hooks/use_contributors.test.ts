import type { TimeWindow } from "@rios0rios0/backstage-plugin-code-health-common";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useContributors } from "../../../src/presentation/hooks/use_contributors";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { StubContributorService } from "../../doubles/stub_contributor_service";

const WINDOW: TimeWindow = {
  from: "2026-08-09T12:00:00.000Z",
  to: "2026-08-10T12:00:00.000Z",
};

describe("useContributors", () => {
  it("should load contributors for the requested window on mount", async () => {
    // given
    const service = new StubContributorService().withContributors([
      ContributorBuilder.create().withDisplayName("alice").build(),
    ]);

    // when
    const { result } = renderHook(() => useContributors(service, WINDOW, true));

    // then
    await waitFor(() => expect(result.current.contributors).toHaveLength(1));
    expect(service.calls.map((call) => call.window)).toEqual([WINDOW]);
  });

  it("should not fetch while it is disabled", async () => {
    // given
    const service = new StubContributorService();

    // when
    renderHook(() => useContributors(service, WINDOW, false));

    // then
    await waitFor(() => expect(service.calls).toEqual([]));
  });

  it("should surface the message a failed request carried", async () => {
    // given
    const service = new StubContributorService().withError(new Error("`from` must be earlier"));

    // when
    const { result } = renderHook(() => useContributors(service, WINDOW, true));

    // then
    await waitFor(() => expect(result.current.error).toBe("`from` must be earlier"));
  });

  it("should refetch on demand", async () => {
    // given
    const service = new StubContributorService();
    const { result } = renderHook(() => useContributors(service, WINDOW, true));
    await waitFor(() => expect(service.calls).toHaveLength(1));

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(service.calls).toHaveLength(2);
  });

  it("should fetch again when the window changes", async () => {
    // given
    const service = new StubContributorService();
    const { rerender } = renderHook(
      ({ window }: { window: TimeWindow }) => useContributors(service, window, true),
      { initialProps: { window: WINDOW } },
    );
    await waitFor(() => expect(service.calls).toHaveLength(1));

    // when
    const wider: TimeWindow = { from: "2026-05-10T12:00:00.000Z", to: WINDOW.to };
    rerender({ window: wider });

    // then
    await waitFor(() => expect(service.calls.map((call) => call.window)).toEqual([WINDOW, wider]));
  });
  it("should ignore a reply for a window the user has already moved on from", async () => {
    // given
    // Two windows in flight resolve in whatever order the network decides; the
    // stale one must not overwrite what is on screen.
    const service = new StubContributorService();
    let releaseFirst: (() => void) | undefined;
    const firstReply = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    let call = 0;
    service.listContributors = async () => {
      call += 1;
      if (call === 1) {
        await firstReply;
        return [ContributorBuilder.create().withDisplayName("stale").build()];
      }
      return [ContributorBuilder.create().withDisplayName("fresh").build()];
    };

    const { result } = renderHook(() => useContributors(service, WINDOW, true));

    // when
    await act(async () => {
      await result.current.refetch();
      releaseFirst?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // then
    expect(result.current.contributors.map((contributor) => contributor.key)).toEqual(["fresh"]);
  });

  it("should ignore a failure for a window the user has already moved on from", async () => {
    // given
    const service = new StubContributorService();
    let call = 0;
    service.listContributors = async () => {
      call += 1;
      if (call === 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("stale failure");
      }
      return [];
    };
    const { result } = renderHook(() => useContributors(service, WINDOW, true));

    // when
    await act(async () => {
      await result.current.refetch();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // then
    expect(result.current.error).toBeNull();
  });
});
