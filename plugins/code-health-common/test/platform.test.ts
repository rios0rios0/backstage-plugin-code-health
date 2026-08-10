import { isPlatform, PLATFORMS } from "../src/platform";

describe("isPlatform", () => {
  it("should accept every platform listed in PLATFORMS", () => {
    // given
    const candidates = PLATFORMS;

    // when
    const results = candidates.map((candidate) => isPlatform(candidate));

    // then
    expect(results).toEqual([true, true]);
  });

  it("should reject an unsupported platform", () => {
    // given / when
    const result = isPlatform("bitbucket");

    // then
    expect(result).toBe(false);
  });

  it("should reject null and undefined", () => {
    // given / when
    const results = [isPlatform(null), isPlatform(undefined)];

    // then
    expect(results).toEqual([false, false]);
  });
});
