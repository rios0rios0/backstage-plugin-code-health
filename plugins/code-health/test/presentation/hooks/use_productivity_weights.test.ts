import { DEFAULT_PRODUCTIVITY_WEIGHTS } from "@rios0rios0/backstage-plugin-code-health-common";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useProductivityWeights } from "../../../src/presentation/hooks/use_productivity_weights";
import { StubScoringService } from "../../doubles/stub_scoring_service";

const customised = {
  ...DEFAULT_PRODUCTIVITY_WEIGHTS,
  lead: { ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead, reviewsGiven: 0.6 },
};

describe("useProductivityWeights", () => {
  it("should read the weights the backend holds", async () => {
    // given
    const service = new StubScoringService().withWeights(customised);

    // when
    const { result } = renderHook(() => useProductivityWeights(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.weights).toEqual(customised);
  });

  it("should score on the defaults until the backend has answered", () => {
    // given
    const service = new StubScoringService().withWeights(customised);

    // when
    const { result } = renderHook(() => useProductivityWeights(service));

    // then
    // What a backend nobody has customised would answer, so the table folds
    // the same numbers before and after the reply on such an install.
    expect(result.current.weights).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS);
    expect(result.current.isLoading).toBe(true);
  });

  it("should fall back to the defaults when the backend cannot answer", async () => {
    // given
    // A backend a release behind has no such route; the tabs already carry
    // the reachability gate, and the defaults are what it scores on anyway.
    const service = new StubScoringService().withReadFailure(new Error("404 Not Found"));

    // when
    const { result } = renderHook(() => useProductivityWeights(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.weights).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS);
  });

  it("should re-read the weights when asked", async () => {
    // given
    const service = new StubScoringService();
    const { result } = renderHook(() => useProductivityWeights(service));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await service.updateProductivityWeights("lead", customised.lead);

    // when
    await act(async () => {
      await result.current.reload();
    });

    // then
    expect(service.readCalls).toBe(2);
    expect(result.current.weights.lead).toEqual(customised.lead);
  });

  it("should ask exactly once for a stable service", async () => {
    // given
    const service = new StubScoringService();

    // when
    const { result, rerender } = renderHook(() => useProductivityWeights(service));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();

    // then
    expect(service.readCalls).toBe(1);
  });
});
