import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubGraphQLContributorRepository } from "../../../src/infrastructure/repositories/github_graphql_contributor_repository";

import { createStubGraphQLClient } from "../../doubles/stub_http_clients";

let mockedGraphql: ReturnType<typeof createStubGraphQLClient>["request"];

const createPRNode = (overrides: Record<string, unknown> = {}) => ({
  number: 1,
  title: "Test PR",
  state: "MERGED",
  createdAt: "2025-01-01T00:00:00Z",
  mergedAt: "2025-01-02T00:00:00Z",
  additions: 100,
  deletions: 50,
  author: {
    login: "testuser",
    avatarUrl: "https://avatars.githubusercontent.com/testuser",
    url: "https://github.com/testuser",
  },
  reviews: { nodes: [{ state: "APPROVED" }] },
  commits: {
    nodes: [
      {
        commit: {
          statusCheckRollup: {
            state: "SUCCESS",
            contexts: { totalCount: 1 },
          },
        },
      },
    ],
  },
  ...overrides,
});

describe("GitHubGraphQLContributorRepository", () => {
  let repository: GitHubGraphQLContributorRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    const stub = createStubGraphQLClient();
    mockedGraphql = stub.request;
    repository = new GitHubGraphQLContributorRepository(stub.client);
  });

  it("should return mapped contributors from single page response", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [createPRNode()],
      },
    });

    // when
    const result = await repository.listContributors("token", "user", null, null);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("testuser");
    expect(result[0].totalPRs).toBe(1);
  });

  it("should paginate when hasNextPage is true", async () => {
    // given
    mockedGraphql
      .mockResolvedValueOnce({
        search: {
          pageInfo: { hasNextPage: true, endCursor: "cursor1" },
          nodes: [createPRNode({ number: 1 })],
        },
      })
      .mockResolvedValueOnce({
        search: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [createPRNode({ number: 2 })],
        },
      });

    // when
    const result = await repository.listContributors("token", "user", null, null);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].totalPRs).toBe(2);
    expect(mockedGraphql).toHaveBeenCalledTimes(2);
  });

  it("should build search query with dateFrom only", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    });

    // when
    await repository.listContributors("token", "user", "2025-01-01", null);

    // then
    const variables = mockedGraphql.mock.calls[0][2] as Record<string, unknown>;
    expect(variables.searchQuery).toContain("created:>=2025-01-01");
    expect(variables.searchQuery).not.toContain("created:<=");
  });

  it("should build search query with dateTo only", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    });

    // when
    await repository.listContributors("token", "user", null, "2025-12-31");

    // then
    const variables = mockedGraphql.mock.calls[0][2] as Record<string, unknown>;
    expect(variables.searchQuery).toContain("created:<=2025-12-31");
    expect(variables.searchQuery).not.toContain("created:>=");
  });

  it("should build search query with both dateFrom and dateTo", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    });

    // when
    await repository.listContributors("token", "user", "2025-01-01", "2025-12-31");

    // then
    const variables = mockedGraphql.mock.calls[0][2] as Record<string, unknown>;
    expect(variables.searchQuery).toContain("created:>=2025-01-01");
    expect(variables.searchQuery).toContain("created:<=2025-12-31");
  });

  it("should build search query without date filter when both are null", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    });

    // when
    await repository.listContributors("token", "user", null, null);

    // then
    const variables = mockedGraphql.mock.calls[0][2] as Record<string, unknown>;
    expect(variables.searchQuery).toBe("type:pr user:user");
  });

  it("should return empty array when no PRs found", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    });

    // when
    const result = await repository.listContributors("token", "user", null, null);

    // then
    expect(result).toEqual([]);
  });
});
