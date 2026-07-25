import {
  DEFAULT_CONTRIBUTOR_FILTER,
  filterContributors,
  sortContributors,
} from "../../../src/domain/entities/contributor_filter";
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
