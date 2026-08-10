import { mapPullRequestsToContributors } from "../../../src/service/mappers/graphql_contributor_mapper";
import type { GraphQLPullRequestNode } from "../../../src/service/mappers/graphql_contributor_node";

const createPR = (overrides: Partial<GraphQLPullRequestNode> = {}): GraphQLPullRequestNode => ({
  number: 1,
  title: "Test PR",
  state: "MERGED",
  createdAt: "2026-01-01T00:00:00Z",
  mergedAt: "2026-01-02T00:00:00Z",
  additions: 100,
  deletions: 50,
  author: {
    login: "alice",
    avatarUrl: "https://avatars.githubusercontent.com/alice",
    url: "https://github.com/alice",
  },
  reviews: { nodes: [] },
  commits: { nodes: [] },
  ...overrides,
});

describe("mapPullRequestsToContributors", () => {
  it("should aggregate PRs by author", () => {
    // given
    const prs = [
      createPR({ number: 1, additions: 100, deletions: 50 }),
      createPR({ number: 2, additions: 200, deletions: 80 }),
    ];

    // when
    const result = mapPullRequestsToContributors(prs);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("alice");
    expect(result[0].totalPRs).toBe(2);
    expect(result[0].linesAdded).toBe(300);
    expect(result[0].linesDeleted).toBe(130);
    expect(result[0].linesOfCode).toBe(430);
  });

  it("should count approved PRs only from APPROVED review state", () => {
    // given
    const prs = [
      createPR({
        number: 1,
        state: "MERGED",
        reviews: { nodes: [{ state: "APPROVED" }] },
      }),
      createPR({
        number: 2,
        state: "MERGED",
        reviews: { nodes: [] },
      }),
    ];

    // when
    const result = mapPullRequestsToContributors(prs);

    // then
    expect(result[0].approvedPRs).toBe(1);
    expect(result[0].totalPRs).toBe(2);
  });

  it("should count rejected PRs from CHANGES_REQUESTED reviews", () => {
    // given
    const prs = [
      createPR({
        number: 1,
        reviews: { nodes: [{ state: "CHANGES_REQUESTED" }] },
      }),
      createPR({
        number: 2,
        reviews: { nodes: [{ state: "APPROVED" }] },
      }),
    ];

    // when
    const result = mapPullRequestsToContributors(prs);

    // then
    expect(result[0].rejectedPRs).toBe(1);
    expect(result[0].prApprovalRate).toBe(50);
  });

  it("should skip PRs with no author", () => {
    // given
    const prs = [
      createPR({ author: null }),
    ];

    // when
    const result = mapPullRequestsToContributors(prs);

    // then
    expect(result).toHaveLength(0);
  });

  it("should calculate pipeline success rate from commit status", () => {
    // given
    const prs = [
      createPR({
        number: 1,
        commits: {
          nodes: [{
            commit: {
              statusCheckRollup: { state: "SUCCESS", contexts: { totalCount: 3 } },
            },
          }],
        },
      }),
      createPR({
        number: 2,
        commits: {
          nodes: [{
            commit: {
              statusCheckRollup: { state: "FAILURE", contexts: { totalCount: 3 } },
            },
          }],
        },
      }),
    ];

    // when
    const result = mapPullRequestsToContributors(prs);

    // then
    expect(result[0].totalPipelineRuns).toBe(2);
    expect(result[0].successfulPipelineRuns).toBe(1);
    expect(result[0].pipelineSuccessRate).toBe(50);
  });

  it("should separate multiple contributors correctly", () => {
    // given
    const prs = [
      createPR({ number: 1, additions: 100, deletions: 50 }),
      createPR({
        number: 2,
        additions: 200,
        deletions: 100,
        author: {
          login: "bob",
          avatarUrl: "https://avatars.githubusercontent.com/bob",
          url: "https://github.com/bob",
        },
      }),
    ];

    // when
    const result = mapPullRequestsToContributors(prs);

    // then
    expect(result).toHaveLength(2);
    const alice = result.find((c) => c.username === "alice");
    const bob = result.find((c) => c.username === "bob");
    expect(alice?.linesOfCode).toBe(150);
    expect(bob?.linesOfCode).toBe(300);
  });
});
