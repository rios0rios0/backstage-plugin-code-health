import { DEFAULT_TREND_MONTHS, TREND_MONTHS, trendBucketFor } from "../src/trend";

describe("trendBucketFor", () => {
  it("should bucket a month by day and anything longer by week", () => {
    // given
    const to = "2026-09-09T00:00:00.000Z";

    // when
    const month = trendBucketFor("2026-08-10T00:00:00.000Z", to);
    const quarter = trendBucketFor("2026-06-09T00:00:00.000Z", to);

    // then
    expect(month).toBe("day");
    expect(quarter).toBe("week");
  });
});

describe("TREND_MONTHS", () => {
  it("should offer one to six months and default inside that range", () => {
    // given / when / then
    expect(TREND_MONTHS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(TREND_MONTHS).toContain(DEFAULT_TREND_MONTHS);
  });
});
