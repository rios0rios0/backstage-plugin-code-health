import { EVENT_KINDS, isEventKind } from "../src/event_kind";

describe("isEventKind", () => {
  it("should accept every kind listed in EVENT_KINDS", () => {
    // given
    const candidates = EVENT_KINDS;

    // when
    const results = candidates.map((candidate) => isEventKind(candidate));

    // then
    expect(results.every(Boolean)).toBe(true);
    expect(results).toHaveLength(6);
  });

  it("should reject a kind the ingestion pipeline does not produce", () => {
    // given / when
    const result = isEventKind("deployment");

    // then
    expect(result).toBe(false);
  });
});
