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
      ContributorBuilder.create().withUsername("alice").build(),
      ContributorBuilder.create().withUsername("bob").build(),
    ];

    // when
    const result = filterContributors(contributors, DEFAULT_CONTRIBUTOR_FILTER);

    // then
    expect(result).toHaveLength(2);
  });

  it("should filter by search query matching username case-insensitively", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").build(),
      ContributorBuilder.create().withUsername("bob").build(),
    ];

    // when
    const result = filterContributors(contributors, {
      ...DEFAULT_CONTRIBUTOR_FILTER,
      searchQuery: "ALICE",
    });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("alice");
  });

  it("should return empty array when search query matches no contributors", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").build(),
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
      ContributorBuilder.create().withUsername("small").withLinesOfCode(100).build(),
      ContributorBuilder.create().withUsername("large").withLinesOfCode(5000).build(),
      ContributorBuilder.create().withUsername("medium").withLinesOfCode(1000).build(),
    ];

    // when
    const result = sortContributors(contributors, "linesOfCode", "desc");

    // then
    expect(result.map((c) => c.username)).toEqual(["large", "medium", "small"]);
  });

  it("should sort by username ascending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("charlie").build(),
      ContributorBuilder.create().withUsername("alice").build(),
      ContributorBuilder.create().withUsername("bob").build(),
    ];

    // when
    const result = sortContributors(contributors, "username", "asc");

    // then
    expect(result.map((c) => c.username)).toEqual(["alice", "bob", "charlie"]);
  });

  it("should sort by approved PRs descending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("few").withApprovedPRs(2).build(),
      ContributorBuilder.create().withUsername("many").withApprovedPRs(20).build(),
    ];

    // when
    const result = sortContributors(contributors, "approvedPRs", "desc");

    // then
    expect(result.map((c) => c.username)).toEqual(["many", "few"]);
  });

  it("should sort by PR approval rate ascending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("high").withPrApprovalRate(95).build(),
      ContributorBuilder.create().withUsername("low").withPrApprovalRate(50).build(),
    ];

    // when
    const result = sortContributors(contributors, "prApprovalRate", "asc");

    // then
    expect(result.map((c) => c.username)).toEqual(["low", "high"]);
  });

  it("should sort by pipeline success rate descending", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("unstable").withPipelineSuccessRate(40).build(),
      ContributorBuilder.create().withUsername("stable").withPipelineSuccessRate(98).build(),
    ];

    // when
    const result = sortContributors(contributors, "pipelineSuccessRate", "desc");

    // then
    expect(result.map((c) => c.username)).toEqual(["stable", "unstable"]);
  });

  it("should sort by Sonar bugs with null metrics treated as zero", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withUsername("buggy")
        .withSonarMetrics({
          bugs: 10,
          codeSmells: 0,
          securityHotspots: 0,
          vulnerabilities: 0,
          coverage: 0,
          duplications: 0,
          technicalDebt: "0min",
          qualityGateStatus: "NONE",
        })
        .build(),
      ContributorBuilder.create().withUsername("clean").build(),
    ];

    // when
    const result = sortContributors(contributors, "bugs", "desc");

    // then
    expect(result.map((c) => c.username)).toEqual(["buggy", "clean"]);
  });
});

describe("sortContributors by Sonar metrics", () => {
  const withSonar = (username: string, overrides: Partial<SonarMetrics>) =>
    ContributorBuilder.create()
      .withUsername(username)
      .withSonarMetrics({
        bugs: 0,
        codeSmells: 0,
        securityHotspots: 0,
        vulnerabilities: 0,
        coverage: 0,
        duplications: 0,
        technicalDebt: "0min",
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
    expect(result.map((c) => c.username)).toEqual(["high", "low"]);
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
    expect(result.map((c) => c.username)).toEqual(["oneHour", "ninetyMinutes", "twoDays"]);
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
    expect(result.map((c) => c.username)).toEqual(["unknown", "someDebt"]);
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
    expect(result.map((c) => c.username)).toEqual(["dayPlus", "dayOnly"]);
  });

  it("should keep the original order when the sort field is not recognised", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("second").build(),
      ContributorBuilder.create().withUsername("first").build(),
    ];

    // when
    const result = sortContributors(
      contributors,
      "unsupported" as unknown as Parameters<typeof sortContributors>[1],
      "asc",
    );

    // then
    expect(result.map((c) => c.username)).toEqual(["second", "first"]);
  });

  it("should treat a contributor without Sonar metrics as zero on every Sonar field", () => {
    // given
    const contributors = [
      withSonar("measured", { coverage: 80 }),
      ContributorBuilder.create().withUsername("unmeasured").build(),
    ];

    // when
    const result = sortContributors(contributors, "coverage", "desc");

    // then
    expect(result.map((c) => c.username)).toEqual(["measured", "unmeasured"]);
  });
});
