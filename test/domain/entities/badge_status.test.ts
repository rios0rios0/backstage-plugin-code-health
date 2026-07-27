import { computeBadgeColor, parseBadgesFromReadme } from "../../../src/domain/entities/badge_status";

describe("computeBadgeColor", () => {
  it("should return green when all checks are present", () => {
    // given
    const checks = [
      { label: "A", present: true },
      { label: "B", present: true },
    ];

    // when
    const result = computeBadgeColor(checks);

    // then
    expect(result).toBe("green");
  });

  it("should return yellow when one check is missing", () => {
    // given
    const checks = [
      { label: "A", present: true },
      { label: "B", present: false },
    ];

    // when
    const result = computeBadgeColor(checks);

    // then
    expect(result).toBe("yellow");
  });

  it("should return yellow when all checks are missing", () => {
    // given
    const checks = [
      { label: "A", present: false },
      { label: "B", present: false },
    ];

    // when
    const result = computeBadgeColor(checks);

    // then
    expect(result).toBe("yellow");
  });
});

describe("parseBadgesFromReadme", () => {
  const ALL_BADGES_README = [
    '<img src="https://img.shields.io/github/release/org/repo.svg" />',
    '<img src="https://img.shields.io/github/license/org/repo.svg" />',
    '<img src="https://img.shields.io/github/actions/workflow/status/org/repo/default.yaml" />',
    '<img src="https://img.shields.io/sonar/coverage/org_repo?server=https%3A%2F%2Fsonarcloud.io" />',
    '<img src="https://img.shields.io/sonar/quality_gate/org_repo?server=https%3A%2F%2Fsonarcloud.io" />',
    '<img src="https://img.shields.io/cii/level/12345" />',
  ].join("\n");

  it("should return green when all required badges are present", () => {
    // given
    const content = ALL_BADGES_README;

    // when
    const result = parseBadgesFromReadme(content);

    // then
    expect(result.color).toBe("green");
    expect(result.checks).toHaveLength(6);
    expect(result.checks.every((c) => c.present)).toBe(true);
  });

  it("should return yellow when some badges are missing", () => {
    // given
    const content = [
      '<img src="https://img.shields.io/github/release/org/repo.svg" />',
      '<img src="https://img.shields.io/github/license/org/repo.svg" />',
    ].join("\n");

    // when
    const result = parseBadgesFromReadme(content);

    // then
    expect(result.color).toBe("yellow");
    expect(result.checks[0].present).toBe(true);
    expect(result.checks[1].present).toBe(true);
    expect(result.checks[2].present).toBe(false);
    expect(result.checks[3].present).toBe(false);
    expect(result.checks[4].present).toBe(false);
    expect(result.checks[5].present).toBe(false);
  });

  it("should return yellow when README is empty", () => {
    // given
    const content = "";

    // when
    const result = parseBadgesFromReadme(content);

    // then
    expect(result.color).toBe("yellow");
    expect(result.checks.every((c) => !c.present)).toBe(true);
  });

  it("should detect OpenSSF via bestpractices.dev pattern", () => {
    // given
    const content = '<a href="https://www.bestpractices.dev/projects/12345"><img src="badge.svg" /></a>';

    // when
    const result = parseBadgesFromReadme(content);

    // then
    const openssf = result.checks.find((c) => c.label === "OpenSSF Best Practices");
    expect(openssf?.present).toBe(true);
  });

  it("should include correct labels for all checks", () => {
    // when
    const result = parseBadgesFromReadme("");

    // then
    const labels = result.checks.map((c) => c.label);
    expect(labels).toEqual([
      "Latest Release",
      "License",
      "Build Status",
      "SonarCloud Coverage",
      "SonarCloud Quality Gate",
      "OpenSSF Best Practices",
    ]);
  });
});
