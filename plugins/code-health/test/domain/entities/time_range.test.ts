import {
  availableRanges,
  DEFAULT_RANGE_ID,
  rangeById,
  TIME_RANGES,
  toWindow,
} from "../../../src/domain/entities/time_range";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("rangeById", () => {
  it("should find a range by its id", () => {
    // given / when
    const range = rangeById("month");

    // then
    expect(range.label).toBe("Last 30 days");
  });

  it("should fall back to the default when the id is unknown", () => {
    // given / when
    const range = rangeById("fortnight" as never);

    // then
    expect(range.id).toBe(DEFAULT_RANGE_ID);
  });
});

describe("toWindow", () => {
  it("should end the window at the given instant", () => {
    // given / when
    const window = toWindow(rangeById("day"), NOW);

    // then
    expect(window.to).toBe("2026-08-10T12:00:00.000Z");
    expect(window.from).toBe("2026-08-09T12:00:00.000Z");
  });

  it("should support a sub-day range", () => {
    // given / when
    // The last hour is what a freshly installed plugin can answer for, so it
    // has to survive the day-based arithmetic rather than rounding to zero.
    const window = toWindow(rangeById("hour"), NOW);

    // then
    expect(window.from).toBe("2026-08-10T11:00:00.000Z");
  });
});

describe("availableRanges", () => {
  it("should offer only the two shortest before anything has been ingested", () => {
    // given / when
    const ranges = availableRanges(null, NOW);

    // then
    // The incremental phase keeps these fresh even before a whole day has been
    // recorded as covered, so they are always answerable.
    expect(ranges.map((range) => range.id)).toEqual(["hour", "day"]);
  });

  it("should offer every range once a full year is covered", () => {
    // given / when
    const ranges = availableRanges("2025-08-09", NOW);

    // then
    expect(ranges).toHaveLength(TIME_RANGES.length);
  });

  it("should offer only what the coverage reaches", () => {
    // given
    // Offering a year when a month has been ingested would render an empty
    // chart that reads as an outage rather than as a backfill still running.
    const ranges = availableRanges("2026-07-01", NOW);

    // then
    expect(ranges.map((range) => range.id)).toEqual(["hour", "day", "week", "month"]);
  });

  it("should still offer the two shortest when coverage is narrower than a week", () => {
    // given / when
    const ranges = availableRanges("2026-08-09", NOW);

    // then
    expect(ranges.map((range) => range.id)).toEqual(["hour", "day"]);
  });
});
