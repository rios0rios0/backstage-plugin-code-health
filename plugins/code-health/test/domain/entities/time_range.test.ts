import {
  availableMonths,
  availableRanges,
  availableYears,
  DEFAULT_RANGE_ID,
  monthLabel,
  monthOf,
  monthsInYear,
  rangeById,
  sameMonth,
  selectionKey,
  shiftMonth,
  TIME_RANGES,
  toWindow,
} from "../../../src/domain/entities/time_range";

const NOW = new Date("2026-08-10T12:00:00.000Z");

/** A local-time instant, for the calendar boundaries the picker resolves. */
const LOCAL_NOON = new Date(2026, 7, 10, 12, 0, 0);

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
    const window = toWindow({ kind: "preset", id: "day" }, NOW);

    // then
    expect(window.to).toBe("2026-08-10T12:00:00.000Z");
    expect(window.from).toBe("2026-08-09T12:00:00.000Z");
  });

  it("should support a sub-day range", () => {
    // given / when
    // The last hour is what a freshly installed plugin can answer for, so it
    // has to survive the day-based arithmetic rather than rounding to zero.
    const window = toWindow({ kind: "preset", id: "hour" }, NOW);

    // then
    expect(window.from).toBe("2026-08-10T11:00:00.000Z");
  });

  it("should start `today` at the local midnight rather than 24 hours back", () => {
    // given / when
    const window = toWindow({ kind: "preset", id: "today" }, LOCAL_NOON);

    // then
    // "Today" and "the last 24 hours" are different questions, and at noon they
    // give different answers — which is why both are offered.
    expect(new Date(window.from).getTime()).toBe(new Date(2026, 7, 10).getTime());
    expect(window.to).toBe(LOCAL_NOON.toISOString());
  });

  it("should span a whole finished calendar month", () => {
    // given / when
    const window = toWindow({ kind: "month", month: { year: 2026, month: 3 } }, LOCAL_NOON);

    // then
    expect(new Date(window.from).getTime()).toBe(new Date(2026, 2, 1).getTime());
    expect(new Date(window.to).getTime()).toBe(new Date(2026, 3, 1).getTime());
  });

  it("should cut the current month off at now rather than running into the future", () => {
    // given / when
    const window = toWindow({ kind: "month", month: { year: 2026, month: 8 } }, LOCAL_NOON);

    // then
    // A window ending in the future would make every chart finish with a flat
    // stretch of days nothing could have happened in yet.
    expect(window.to).toBe(LOCAL_NOON.toISOString());
  });

  it("should roll a December selection into the next year", () => {
    // given / when
    const window = toWindow(
      { kind: "month", month: { year: 2025, month: 12 } },
      LOCAL_NOON,
    );

    // then
    expect(new Date(window.to).getTime()).toBe(new Date(2026, 0, 1).getTime());
  });
});

describe("selectionKey", () => {
  it("should distinguish a preset from a month", () => {
    // given / when
    const preset = selectionKey({ kind: "preset", id: "month" });
    const month = selectionKey({ kind: "month", month: { year: 2026, month: 3 } });

    // then
    // The key is what the window is memoised on, so two different selections
    // sharing one would freeze the dashboard on the first of them.
    expect(preset).not.toBe(month);
  });
});

describe("month helpers", () => {
  it("should read the month out of an instant as 1-12", () => {
    // given / when
    const month = monthOf(new Date(2026, 0, 15));

    // then
    expect(month).toEqual({ year: 2026, month: 1 });
  });

  it("should step backwards across a year boundary", () => {
    // given / when
    const previous = shiftMonth({ year: 2026, month: 1 }, -1);

    // then
    expect(previous).toEqual({ year: 2025, month: 12 });
  });

  it("should step forwards across a year boundary", () => {
    // given / when
    const next = shiftMonth({ year: 2025, month: 12 }, 1);

    // then
    expect(next).toEqual({ year: 2026, month: 1 });
  });

  it("should compare two months by year and month", () => {
    // given / when / then
    expect(sameMonth({ year: 2026, month: 3 }, { year: 2026, month: 3 })).toBe(true);
    expect(sameMonth({ year: 2026, month: 3 }, { year: 2025, month: 3 })).toBe(false);
  });

  it("should label a month for a reader", () => {
    // given / when
    const label = monthLabel({ year: 2026, month: 3 });

    // then
    expect(label).toBe("March 2026");
  });
});

describe("availableRanges", () => {
  it("should offer only the sub-day ranges before anything has been ingested", () => {
    // given / when
    const ranges = availableRanges(null, NOW);

    // then
    // The incremental phase keeps these fresh even before a whole day has been
    // recorded as covered, so they are always answerable.
    expect(ranges.map((range) => range.id)).toEqual(["today", "hour", "day"]);
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
    expect(ranges.map((range) => range.id)).toEqual([
      "today",
      "hour",
      "day",
      "week",
      "month",
    ]);
  });

  it("should still offer the sub-day ranges when coverage is narrower than a week", () => {
    // given / when
    const ranges = availableRanges("2026-08-09", NOW);

    // then
    expect(ranges.map((range) => range.id)).toEqual(["today", "hour", "day"]);
  });
});

describe("availableMonths", () => {
  it("should offer only the current month before anything has been ingested", () => {
    // given / when
    const months = availableMonths(null, LOCAL_NOON);

    // then
    expect(months).toEqual([{ year: 2026, month: 8 }]);
  });

  it("should run from the current month back to the earliest covered one", () => {
    // given / when
    const months = availableMonths("2026-05-14", LOCAL_NOON);

    // then
    // Newest first, because the month somebody wants is far more often a recent
    // one than the oldest the backfill happens to reach.
    expect(months).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 7 },
      { year: 2026, month: 6 },
      { year: 2026, month: 5 },
    ]);
  });

  it("should span a year boundary", () => {
    // given / when
    const months = availableMonths("2025-11-02", LOCAL_NOON);

    // then
    expect(months).toHaveLength(10);
    expect(months[months.length - 1]).toEqual({ year: 2025, month: 11 });
  });

  it("should fall back to the current month when the earliest day is unparseable", () => {
    // given / when
    const months = availableMonths("not-a-day", LOCAL_NOON);

    // then
    // Stored data reaches this, and one malformed value should narrow the picker
    // rather than hang the render walking backwards forever.
    expect(months).toEqual([{ year: 2026, month: 8 }]);
  });

  it("should stop rather than loop when the earliest day is in the future", () => {
    // given / when
    const months = availableMonths("2027-01-01", LOCAL_NOON);

    // then
    expect(months).toEqual([{ year: 2026, month: 8 }]);
  });
});

describe("availableYears", () => {
  it("should list each year once, newest first", () => {
    // given
    const months = availableMonths("2025-11-02", LOCAL_NOON);

    // when
    const years = availableYears(months);

    // then
    expect(years).toEqual([2026, 2025]);
  });
});

describe("monthsInYear", () => {
  it("should keep only the months belonging to the year", () => {
    // given
    const months = availableMonths("2025-11-02", LOCAL_NOON);

    // when
    const inner = monthsInYear(months, 2025);

    // then
    expect(inner.map((month) => month.month)).toEqual([12, 11]);
  });
});
