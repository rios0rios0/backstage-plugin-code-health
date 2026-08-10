import { fullyCoveredDays } from "../../../src/domain/entities/day";

describe("fullyCoveredDays", () => {
  it("should cover a window that spans exactly one day", () => {
    // given / when
    const result = fullyCoveredDays(
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-10T00:00:00.000Z"),
    );

    // then
    expect(result).toEqual(["2026-08-09"]);
  });

  it("should cover every whole day a longer window contains", () => {
    // given / when
    const result = fullyCoveredDays(
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-12T00:00:00.000Z"),
    );

    // then
    expect(result).toEqual(["2026-08-09", "2026-08-10", "2026-08-11"]);
  });

  it("should cover nothing when the window starts mid-day and ends the same day", () => {
    // given / when
    // The incremental phase advances in partial days by nature. Recording the
    // day as fetched here would make the dashboard offer a range it can only
    // answer part of.
    const result = fullyCoveredDays(
      new Date("2026-08-09T10:00:00.000Z"),
      new Date("2026-08-09T14:00:00.000Z"),
    );

    // then
    expect(result).toEqual([]);
  });

  it("should skip the partial day at the start", () => {
    // given / when
    const result = fullyCoveredDays(
      new Date("2026-08-09T10:00:00.000Z"),
      new Date("2026-08-11T00:00:00.000Z"),
    );

    // then
    expect(result).toEqual(["2026-08-10"]);
  });

  it("should skip the partial day at the end", () => {
    // given / when
    const result = fullyCoveredDays(
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-10T14:00:00.000Z"),
    );

    // then
    expect(result).toEqual(["2026-08-09"]);
  });

  it("should cover nothing when the window is inverted", () => {
    // given / when
    const result = fullyCoveredDays(
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-09T00:00:00.000Z"),
    );

    // then
    expect(result).toEqual([]);
  });

  it("should cover nothing when the window is empty", () => {
    // given / when
    const result = fullyCoveredDays(
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-09T00:00:00.000Z"),
    );

    // then
    expect(result).toEqual([]);
  });
});
