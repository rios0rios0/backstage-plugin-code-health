import { act, renderHook, waitFor } from "@testing-library/react";
import { useCoverage } from "../../../src/presentation/hooks/use_coverage";
import { aCoverageInfo, StubCoverageService } from "../../doubles/stub_coverage_service";

describe("useCoverage", () => {
  it("should read the coverage on mount", async () => {
    // given
    const coverage = aCoverageInfo({ earliestDay: "2026-01-01" });
    const service = new StubCoverageService().withCoverage(coverage);

    // when
    const { result } = renderHook(() => useCoverage(service));

    // then
    await waitFor(() => expect(result.current.coverage).toEqual(coverage));
    expect(result.current.isLoading).toBe(false);
  });

  it("should report a failure rather than presenting an empty dashboard", async () => {
    // given
    // "The backend is not installed" and "the backfill has not started" look
    // identical from an empty dashboard, so the distinction has to survive.
    const service = new StubCoverageService().withError(new Error("404 Not Found"));

    // when
    const { result } = renderHook(() => useCoverage(service));

    // then
    await waitFor(() => expect(result.current.error).toBe("404 Not Found"));
    expect(result.current.coverage).toBeNull();
  });

  it("should reload on demand", async () => {
    // given
    const service = new StubCoverageService();
    const { result } = renderHook(() => useCoverage(service));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    await act(async () => {
      await result.current.reload();
    });

    // then
    expect(result.current.error).toBeNull();
    expect(result.current.coverage).not.toBeNull();
  });

  it("should describe a non-error rejection rather than showing nothing", async () => {
    // given
    const service = new StubCoverageService();
    // Something that is not an `Error`, which is what a rejected `fetch` in a
    // browser extension or a stray `Promise.reject(value)` produces.
    const rejection: unknown = { reason: "boom" };
    service.getCoverage = () => Promise.reject(rejection);

    // when
    const { result } = renderHook(() => useCoverage(service));

    // then
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to read ingestion coverage"),
    );
  });
});
