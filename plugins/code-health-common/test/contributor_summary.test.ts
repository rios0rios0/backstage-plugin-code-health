import { computeRate } from "../src/contributor_summary";

describe("computeRate", () => {
  it("should return the percentage rounded to one decimal", () => {
    // given / when
    const result = computeRate(1, 3);

    // then
    expect(result).toBe(33.3);
  });

  it("should return 100 when every attempt succeeded", () => {
    // given / when
    const result = computeRate(7, 7);

    // then
    expect(result).toBe(100);
  });

  it("should return 0 when there were no attempts", () => {
    // given / when
    const result = computeRate(0, 0);

    // then
    expect(result).toBe(0);
  });

  it("should return 0 when the total is negative", () => {
    // given / when
    const result = computeRate(5, -1);

    // then
    expect(result).toBe(0);
  });
});
