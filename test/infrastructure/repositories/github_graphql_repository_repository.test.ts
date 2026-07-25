import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubGraphQLRepositoryRepository } from "../../../src/infrastructure/repositories/github_graphql_repository_repository";

import { createStubGraphQLClient } from "../../doubles/stub_http_clients";

let mockedGraphql: ReturnType<typeof createStubGraphQLClient>["request"];

const createNode = (overrides: Record<string, unknown> = {}) => ({
  id: "R_1",
  name: "my-repo",
  nameWithOwner: "user/my-repo",
  url: "https://github.com/user/my-repo",
  description: "A test repo",
  visibility: "PUBLIC",
  isArchived: false,
  isFork: false,
  updatedAt: "2025-01-01T00:00:00Z",
  primaryLanguage: { name: "TypeScript" },
  defaultBranchRef: {
    name: "main",
    target: {
      oid: "abc123",
      messageHeadline: "init",
      commitUrl: "https://github.com/user/my-repo/commit/abc123",
      statusCheckRollup: { state: "SUCCESS" },
    },
  },
  latestRelease: null,
  refs: { nodes: [] },
  branchRefs: { nodes: [{ name: "main" }] },
  ...overrides,
});

describe("GitHubGraphQLRepositoryRepository", () => {
  let repository: GitHubGraphQLRepositoryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    const stub = createStubGraphQLClient();
    mockedGraphql = stub.request;
    repository = new GitHubGraphQLRepositoryRepository(stub.client);
  });

  it("should return mapped repositories from single page response", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      user: {
        repositories: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [createNode()],
        },
      },
    });

    // when
    const result = await repository.listAll("token", "user");

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-repo");
    expect(result[0].fullName).toBe("user/my-repo");
  });

  it("should paginate when hasNextPage is true", async () => {
    // given
    mockedGraphql
      .mockResolvedValueOnce({
        user: {
          repositories: {
            pageInfo: { hasNextPage: true, endCursor: "cursor1" },
            nodes: [createNode({ id: "R_1", name: "repo-1", nameWithOwner: "user/repo-1" })],
          },
        },
      })
      .mockResolvedValueOnce({
        user: {
          repositories: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [createNode({ id: "R_2", name: "repo-2", nameWithOwner: "user/repo-2" })],
          },
        },
      });

    // when
    const result = await repository.listAll("token", "user");

    // then
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("repo-1");
    expect(result[1].name).toBe("repo-2");
    expect(mockedGraphql).toHaveBeenCalledTimes(2);
  });

  it("should return empty array when user has no repositories", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce({
      user: {
        repositories: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      },
    });

    // when
    const result = await repository.listAll("token", "user");

    // then
    expect(result).toEqual([]);
  });

  it("should propagate error when GraphQL request fails", async () => {
    // given
    mockedGraphql.mockRejectedValueOnce(new Error("GitHub API error: 401 Unauthorized"));

    // when / then
    await expect(repository.listAll("bad-token", "user")).rejects.toThrow(
      "GitHub API error: 401 Unauthorized",
    );
  });
});
