import { computeComplianceColor } from "../src/compliance_status";

describe("computeComplianceColor", () => {
  it("should return green when all checks pass", () => {
    // given
    const checks = [true, true, true, true];

    // when
    const result = computeComplianceColor(checks);

    // then
    expect(result).toBe("green");
  });

  it("should return yellow when exactly one check fails", () => {
    // given
    const checks = [false, true, true, true];

    // when
    const result = computeComplianceColor(checks);

    // then
    expect(result).toBe("yellow");
  });

  it("should return yellow when a different single check fails", () => {
    // given
    const checks = [true, true, false, true];

    // when
    const result = computeComplianceColor(checks);

    // then
    expect(result).toBe("yellow");
  });

  it("should return red when two checks fail", () => {
    // given
    const checks = [false, false, true, true];

    // when
    const result = computeComplianceColor(checks);

    // then
    expect(result).toBe("red");
  });

  it("should return red when all checks fail", () => {
    // given
    const checks = [false, false, false, false];

    // when
    const result = computeComplianceColor(checks);

    // then
    expect(result).toBe("red");
  });
});
