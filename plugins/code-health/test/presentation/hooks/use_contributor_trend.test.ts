import type {
  TimeSeriesBucket,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useContributorTrend } from "../../../src/presentation/hooks/use_contributor_trend";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { aTrendPoint } from "../../builders/contributor_trend_builder";
import { aContributorTrend, StubTrendService } from "../../doubles/stub_trend_service";

const KEY = "user:default/jane";

const WINDOW: TimeWindow = {
  from: "2026-06-09T12:00:00.000Z",
  to: "2026-09-09T12:00:00.000Z",
};

describe("useContributorTrend", () => {
  it("should read the person's history for the requested window and bucket", async () => {
    // given
    const service = new StubTrendService().withContributorTrend(
      aContributorTrend({
        summary: ContributorBuilder.create().withDisplayName("Jane Roe").build(),
        points: [aTrendPoint("2026-08-01", ContributorBuilder.create().build())],
      }),
    );

    // when
    const { result } = renderHook(() =>
      useContributorTrend(service, KEY, WINDOW, "week"),
    );

    // then
    await waitFor(() => expect(result.current.trend?.points).toHaveLength(1));
    expect(service.contributorCalls).toEqual([
      { key: KEY, window: WINDOW, bucket: "week" },
    ]);
  });

  it("should ask for nothing when the page was opened without a key", async () => {
    // given
    // The empty key would come back as a person who recorded nothing, which is
    // the wrong answer to "you followed a link with no name in it".
    const service = new StubTrendService();

    // when
    const { result } = renderHook(() =>
      useContributorTrend(service, null, WINDOW, "week"),
    );

    // then
    await waitFor(() => expect(service.contributorCalls).toEqual([]));
    expect(result.current.trend).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("should surface the message a failed request carried", async () => {
    // given
    const service = new StubTrendService().withError(new Error("no such contributor"));

    // when
    const { result } = renderHook(() =>
      useContributorTrend(service, KEY, WINDOW, "week"),
    );

    // then
    await waitFor(() => expect(result.current.error).toBe("no such contributor"));
    expect(result.current.trend).toBeNull();
  });

  it("should read again when a wider range is picked", async () => {
    // given
    const service = new StubTrendService();
    const { rerender } = renderHook(
      ({ window, bucket }: { window: TimeWindow; bucket: TimeSeriesBucket }) =>
        useContributorTrend(service, KEY, window, bucket),
      {
        initialProps: {
          window: WINDOW,
          bucket: "day",
        } as { window: TimeWindow; bucket: TimeSeriesBucket },
      },
    );
    await waitFor(() => expect(service.contributorCalls).toHaveLength(1));

    // when
    const wider: TimeWindow = { from: "2026-03-09T12:00:00.000Z", to: WINDOW.to };
    rerender({ window: wider, bucket: "week" });

    // then
    await waitFor(() =>
      expect(service.contributorCalls.map((call) => call.bucket)).toEqual([
        "day",
        "week",
      ]),
    );
  });

  it("should read again on demand", async () => {
    // given
    const service = new StubTrendService();
    const { result } = renderHook(() =>
      useContributorTrend(service, KEY, WINDOW, "week"),
    );
    await waitFor(() => expect(service.contributorCalls).toHaveLength(1));

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(service.contributorCalls).toHaveLength(2);
  });

  it("should ignore a reply for a range the reader has already moved on from", async () => {
    // given
    // Two ranges in flight resolve in whatever order the network decides; the
    // stale one must not overwrite what is on screen.
    const service = new StubTrendService();
    let releaseFirst: (() => void) | undefined;
    const firstReply = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    let call = 0;
    service.getContributorTrend = async () => {
      call += 1;
      if (call === 1) {
        await firstReply;
        return aContributorTrend({ key: "stale" });
      }
      return aContributorTrend({ key: "fresh" });
    };

    const { result } = renderHook(() =>
      useContributorTrend(service, KEY, WINDOW, "week"),
    );

    // when
    await act(async () => {
      await result.current.refetch();
      releaseFirst?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // then
    expect(result.current.trend?.key).toBe("fresh");
  });

  it("should ignore a failure for a range the reader has already moved on from", async () => {
    // given
    const service = new StubTrendService();
    let call = 0;
    service.getContributorTrend = async () => {
      call += 1;
      if (call === 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("stale failure");
      }
      return aContributorTrend();
    };
    const { result } = renderHook(() =>
      useContributorTrend(service, KEY, WINDOW, "week"),
    );

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
    // A rejected promise is not always an `Error`; the page still has to say
    // something other than "null".
    const service = new StubTrendService();
    // Rejected with a bare string rather than thrown, because a rejection is
    // exactly what a `fetch` layer produces and nothing guarantees it carries
    // an `Error`.
    service.getContributorTrend = () => Promise.reject("boom");

    // when
    const { result } = renderHook(() =>
      useContributorTrend(service, KEY, WINDOW, "week"),
    );

    // then
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to fetch the contributor trend"),
    );
  });
});
