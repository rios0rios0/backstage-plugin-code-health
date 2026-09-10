import {
  availableTrendMonths,
  monthsBefore,
  trendWindow,
} from "../../../src/domain/entities/trend_range";

describe("monthsBefore", () => {
  it("should step back whole calendar months", () => {
    // given
    const now = new Date(2026, 8, 9, 15, 30, 0, 0);

    // when
    const from = monthsBefore(now, 3);

    // then
    expect(from).toEqual(new Date(2026, 5, 9, 15, 30, 0, 0));
  });

  it("should clamp the day rather than roll into the next month", () => {
    // given
    // Three months before the thirty-first of May is the twenty-eighth of
    // February, not the third of March.
    const now = new Date(2026, 4, 31, 12, 0, 0, 0);

    // when
    const from = monthsBefore(now, 3);

    // then
    expect(from).toEqual(new Date(2026, 1, 28, 12, 0, 0, 0));
  });

  it("should cross a year boundary", () => {
    // given
    const now = new Date(2026, 1, 15);

    // when
    const from = monthsBefore(now, 6);

    // then
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(7);
  });
});

describe("trendWindow", () => {
  it("should end now and start the requested months earlier", () => {
    // given
    const now = new Date(2026, 8, 9, 10, 0, 0, 0);

    // when
    const window = trendWindow(2, now);

    // then
    expect(window.to).toBe(now.toISOString());
    expect(window.from).toBe(new Date(2026, 6, 9, 10, 0, 0, 0).toISOString());
  });
});

describe("availableTrendMonths", () => {
  const now = new Date(2026, 8, 9);

  it("should offer only the shortest count before anything is covered", () => {
    // given / when / then
    expect(availableTrendMonths(null, now)).toEqual([1]);
    expect(availableTrendMonths("not-a-day", now)).toEqual([1]);
  });

  it("should offer the counts whose window starts inside the covered history", () => {
    // given
    // Covered since the first of June: three months reach the ninth of June,
    // four months reach the ninth of May, which is before the coverage began.
    const earliestDay = "2026-06-01";

    // when
    const offered = availableTrendMonths(earliestDay, now);

    // then
    expect(offered).toEqual([1, 2, 3]);
  });

  it("should offer every count once a year is covered", () => {
    // given / when / then
    expect(availableTrendMonths("2025-09-01", now)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("should still offer the shortest count when even a month is not covered", () => {
    // given
    // A fresh install has a week of history; the page shows that week rather
    // than nothing, and says the rest is being collected.
    const earliestDay = "2026-09-05";

    // when
    const offered = availableTrendMonths(earliestDay, now);

    // then
    expect(offered).toEqual([1]);
  });
});
