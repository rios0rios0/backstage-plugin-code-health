import {
  DEFAULT_CONTRIBUTOR_FILTER,
  filterContributors,
  sortContributors,
} from "../../../src/domain/entities/contributor_filter";
import type { SonarMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import { ContributorBuilder } from "../../builders/contributor_builder";

describe("filterContributors", () => {
  it("should return all contributors when no filters are active", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("alice").build(),
      ContributorBuilder.create().withDisplayName("bob").build(),
    ];

    // when
    const result = filterContributors(contributors, DEFAULT_CONTRIBUTOR_FILTER);

    // then
    expect(result).toHaveLength(2);
  });

  it("should filter by search query matching displayName case-insensitively", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("alice").build(),
      ContributorBuilder.create().withDisplayName("bob").build(),
    ];

    // when
    const result = filterContributors(contributors, {
      ...DEFAULT_CONTRIBUTOR_FILTER,
      searchQuery: "ALICE",
    });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("alice");
  });

  it("should return empty array when search query matches no contributors", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("alice").build(),
    ];

    // when
    const result = filterContributors(contributors, {
      ...DEFAULT_CONTRIBUTOR_FILTER,
      searchQuery: "xyz",
    });

    // then
    expect(result).toHaveLength(0);
  });
});

describe("sortContributors", () => {
  it("should sort by lines of code descending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("small").withLinesOfCode(100).build(),
      ContributorBuilder.create().withDisplayName("large").withLinesOfCode(5000).build(),
      ContributorBuilder.create().withDisplayName("medium").withLinesOfCode(1000).build(),
    ];

    // when
    const result = sortContributors(contributors, "linesOfCode", "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["large", "medium", "small"]);
  });

  it("should sort by displayName ascending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("charlie").build(),
      ContributorBuilder.create().withDisplayName("alice").build(),
      ContributorBuilder.create().withDisplayName("bob").build(),
    ];

    // when
    const result = sortContributors(contributors, "displayName", "asc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["alice", "bob", "charlie"]);
  });

  it("should sort by approved PRs descending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("few").withReviewsApproved(2).build(),
      ContributorBuilder.create().withDisplayName("many").withReviewsApproved(20).build(),
    ];

    // when
    const result = sortContributors(contributors, "reviewsApproved", "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["many", "few"]);
  });

  it("should sort by PR approval rate ascending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("high").withPrApprovalRate(95).build(),
      ContributorBuilder.create().withDisplayName("low").withPrApprovalRate(50).build(),
    ];

    // when
    const result = sortContributors(contributors, "prApprovalRate", "asc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["low", "high"]);
  });

  it("should sort by pipeline success rate descending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("unstable").withPipelineSuccessRate(40).build(),
      ContributorBuilder.create().withDisplayName("stable").withPipelineSuccessRate(98).build(),
    ];

    // when
    const result = sortContributors(contributors, "pipelineSuccessRate", "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["stable", "unstable"]);
  });

  it("should sort by Sonar bugs with null metrics treated as zero", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("buggy")
        .withSonarMetrics({
          bugs: 10,
          codeSmells: 0,
          securityHotspots: 0,
          vulnerabilities: 0,
          coverage: 0,
          duplications: 0,
          technicalDebt: "0min",
          technicalDebtMinutes: 0,
          qualityGateStatus: "NONE",
        })
        .build(),
      ContributorBuilder.create().withDisplayName("clean").build(),
    ];

    // when
    const result = sortContributors(contributors, "bugs", "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["buggy", "clean"]);
  });
});

describe("sortContributors by Sonar metrics", () => {
  const withSonar = (displayName: string, overrides: Partial<SonarMetrics>) =>
    ContributorBuilder.create()
      .withDisplayName(displayName)
      .withSonarMetrics({
        bugs: 0,
        codeSmells: 0,
        securityHotspots: 0,
        vulnerabilities: 0,
        coverage: 0,
        duplications: 0,
        technicalDebt: "0min",
        technicalDebtMinutes: 0,
        qualityGateStatus: "NONE",
        ...overrides,
      })
      .build();

  it.each([
    ["codeSmells", { codeSmells: 42 }],
    ["securityHotspots", { securityHotspots: 7 }],
    ["vulnerabilities", { vulnerabilities: 3 }],
    ["coverage", { coverage: 91.4 }],
    ["duplications", { duplications: 12.5 }],
  ] as const)("should sort by %s descending", (field, overrides) => {
    // given
    const contributors = [
      withSonar("low", {}),
      withSonar("high", overrides),
    ];

    // when
    const result = sortContributors(contributors, field, "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["high", "low"]);
  });

  it("should rank technical debt by its parsed duration, not its string form", () => {
    // given
    const contributors = [
      withSonar("oneHour", { technicalDebt: "1h" }),
      withSonar("twoDays", { technicalDebt: "2d" }),
      withSonar("ninetyMinutes", { technicalDebt: "1h30min" }),
    ];

    // when
    const result = sortContributors(contributors, "technicalDebt", "asc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["oneHour", "ninetyMinutes", "twoDays"]);
  });

  it("should treat an unparseable technical debt string as no debt", () => {
    // given
    const contributors = [
      withSonar("unknown", { technicalDebt: "n/a" }),
      withSonar("someDebt", { technicalDebt: "5min" }),
    ];

    // when
    const result = sortContributors(contributors, "technicalDebt", "asc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["unknown", "someDebt"]);
  });

  it("should combine days, hours and minutes when ranking technical debt", () => {
    // given
    const contributors = [
      withSonar("dayOnly", { technicalDebt: "1d" }),
      withSonar("dayPlus", { technicalDebt: "1d2h30min" }),
    ];

    // when
    const result = sortContributors(contributors, "technicalDebt", "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["dayPlus", "dayOnly"]);
  });

  it("should keep the original order when the sort field is not recognised", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("second").build(),
      ContributorBuilder.create().withDisplayName("first").build(),
    ];

    // when
    const result = sortContributors(
      contributors,
      "unsupported" as unknown as Parameters<typeof sortContributors>[1],
      "asc",
    );

    // then
    expect(result.map((c) => c.displayName)).toEqual(["second", "first"]);
  });

  it("should treat a contributor without Sonar metrics as zero on every Sonar field", () => {
    // given
    const contributors = [
      withSonar("measured", { coverage: 80 }),
      ContributorBuilder.create().withDisplayName("unmeasured").build(),
    ];

    // when
    const result = sortContributors(contributors, "coverage", "desc");

    // then
    expect(result.map((c) => c.displayName)).toEqual(["measured", "unmeasured"]);
  });
});
