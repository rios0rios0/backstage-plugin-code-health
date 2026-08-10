import { isTimeSeriesBucket, TIME_SERIES_BUCKETS } from "../src/time_series";

describe("isTimeSeriesBucket", () => {
  it("should accept every bucket listed in TIME_SERIES_BUCKETS", () => {
    // given
    const candidates = TIME_SERIES_BUCKETS;

    // when
    const results = candidates.map((candidate) => isTimeSeriesBucket(candidate));

    // then
    expect(results).toEqual([true, true, true]);
  });

  it("should reject a bucket the backend cannot aggregate", () => {
    // given / when
    const result = isTimeSeriesBucket("hour");

    // then
    expect(result).toBe(false);
  });
});
