import { CI_STATES, isCIState } from "../src/workflow_status";

describe("isCIState", () => {
  it("should accept every state listed in CI_STATES", () => {
    // given
    const candidates = CI_STATES;

    // when
    const results = candidates.map((candidate) => isCIState(candidate));

    // then
    expect(results.every(Boolean)).toBe(true);
    expect(results).toHaveLength(6);
  });

  it("should reject a state that is not part of the union", () => {
    // given / when
    const result = isCIState("QUEUED");

    // then
    expect(result).toBe(false);
  });

  it("should reject a state that differs only by case", () => {
    // given / when
    const result = isCIState("success");

    // then
    expect(result).toBe(false);
  });
});
