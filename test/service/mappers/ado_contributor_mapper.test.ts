import { mapAdoPullRequestsToContributors } from "../../../src/service/mappers/ado_contributor_mapper";
import type { AdoPullRequestNode } from "../../../src/service/mappers/ado_contributor_node";

const createPR = (overrides: Partial<AdoPullRequestNode> = {}): AdoPullRequestNode => ({
  pullRequestId: 1,
  title: "Test PR",
  status: "completed",
  creationDate: "2026-01-01T00:00:00Z",
  closedDate: "2026-01-02T00:00:00Z",
  createdBy: {
    displayName: "Alice",
    uniqueName: "alice@example.com",
    imageUrl: "https://dev.azure.com/_api/_common/identityImage?id=alice",
    url: "https://dev.azure.com/org/_apis/identities/alice",
  },
  reviewers: [],
  lastMergeSourceCommit: { commitId: "abc123" },
  repository: { id: "repo-1", name: "my-repo", project: { name: "proj" } },
  ...overrides,
});

describe("mapAdoPullRequestsToContributors", () => {
  it("should aggregate PRs by author", () => {
    // given
    const prs = [
      createPR({ pullRequestId: 1 }),
      createPR({ pullRequestId: 2 }),
    ];

    // when
    const result = mapAdoPullRequestsToContributors(prs);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("Alice");
    expect(result[0].totalPRs).toBe(2);
  });

  it("should count approved PRs from reviewer votes", () => {
    // given
    const prs = [
      createPR({
        pullRequestId: 1,
        reviewers: [{ displayName: "Bob", uniqueName: "bob@example.com", vote: 10, imageUrl: "", url: "" }],
      }),
      createPR({
        pullRequestId: 2,
        reviewers: [{ displayName: "Bob", uniqueName: "bob@example.com", vote: 0, imageUrl: "", url: "" }],
      }),
    ];

    // when
    const result = mapAdoPullRequestsToContributors(prs);

    // then
    expect(result[0].approvedPRs).toBe(1);
    expect(result[0].totalPRs).toBe(2);
  });

  it("should count vote 5 (approved with suggestions) as approved", () => {
    // given
    const prs = [
      createPR({
        reviewers: [{ displayName: "Bob", uniqueName: "bob@example.com", vote: 5, imageUrl: "", url: "" }],
      }),
    ];

    // when
    const result = mapAdoPullRequestsToContributors(prs);

    // then
    expect(result[0].approvedPRs).toBe(1);
  });

  it("should count rejected PRs from vote -10", () => {
    // given
    const prs = [
      createPR({
        reviewers: [{ displayName: "Bob", uniqueName: "bob@example.com", vote: -10, imageUrl: "", url: "" }],
      }),
    ];

    // when
    const result = mapAdoPullRequestsToContributors(prs);

    // then
    expect(result[0].rejectedPRs).toBe(1);
    expect(result[0].prApprovalRate).toBe(0);
  });

  it("should separate multiple contributors correctly", () => {
    // given
    const prs = [
      createPR({ pullRequestId: 1 }),
      createPR({
        pullRequestId: 2,
        createdBy: {
          displayName: "Bob",
          uniqueName: "bob@example.com",
          imageUrl: "https://dev.azure.com/_api/_common/identityImage?id=bob",
          url: "https://dev.azure.com/org/_apis/identities/bob",
        },
      }),
    ];

    // when
    const result = mapAdoPullRequestsToContributors(prs);

    // then
    expect(result).toHaveLength(2);
  });

  it("should set line stats to zero (ADO limitation)", () => {
    // given
    const prs = [createPR()];

    // when
    const result = mapAdoPullRequestsToContributors(prs);

    // then
    expect(result[0].linesOfCode).toBe(0);
    expect(result[0].linesAdded).toBe(0);
    expect(result[0].linesDeleted).toBe(0);
  });

  it("should return empty array for no PRs", () => {
    // when
    const result = mapAdoPullRequestsToContributors([]);

    // then
    expect(result).toHaveLength(0);
  });
});
