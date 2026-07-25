import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdoRestContributorRepository } from "../../../src/infrastructure/repositories/ado_rest_contributor_repository";

import { createStubAdoRestClient } from "../../doubles/stub_http_clients";

let mockedAdo: ReturnType<typeof createStubAdoRestClient>["get"];

const createProject = (name: string) => ({
  id: `proj-${name}`,
  name,
  description: null,
  url: `https://dev.azure.com/org/${name}`,
  visibility: "private" as const,
  state: "wellFormed",
});

const createRepo = (name: string, projectName: string) => ({
  id: `repo-${name}`,
  name,
  url: `https://dev.azure.com/org/${projectName}/_git/${name}`,
  webUrl: `https://dev.azure.com/org/${projectName}/_git/${name}`,
  project: createProject(projectName),
  defaultBranch: "refs/heads/main",
  isFork: false,
  isDisabled: false,
  size: 1000,
});

const createPR = (id: number, authorName: string) => ({
  pullRequestId: id,
  title: `PR ${id}`,
  status: "completed" as const,
  creationDate: "2025-01-01T00:00:00Z",
  closedDate: "2025-01-02T00:00:00Z",
  createdBy: {
    displayName: authorName,
    uniqueName: `${authorName}@org.com`,
    imageUrl: "https://avatar.example.com",
    url: "https://dev.azure.com/org/_apis/identities",
  },
  reviewers: [
    {
      displayName: "reviewer",
      uniqueName: "reviewer@org.com",
      vote: 10,
      imageUrl: "https://avatar.example.com",
      url: "https://dev.azure.com/org/_apis/identities",
    },
  ],
  lastMergeSourceCommit: { commitId: "abc123" },
  repository: { id: "repo-1", name: "repo1", project: { name: "proj1" } },
});

describe("AdoRestContributorRepository", () => {
  let repository: AdoRestContributorRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    const stub = createStubAdoRestClient();
    mockedAdo = stub.get;
    repository = new AdoRestContributorRepository(stub.client);
  });

  it("should fetch PRs from all repos across all projects", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createPR(1, "alice"), createPR(2, "bob")], count: 2 });

    // when
    const result = await repository.listContributors("token", "org", null, null);

    // then
    expect(result).toHaveLength(2);
    const usernames = result.map((c) => c.username);
    expect(usernames).toContain("alice");
    expect(usernames).toContain("bob");
  });

  it("should skip projects where repo access fails", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1"), createProject("proj2")], count: 2 })
      .mockRejectedValueOnce(new Error("403 Forbidden"))
      .mockResolvedValueOnce({ value: [createRepo("repo2", "proj2")], count: 1 })
      .mockResolvedValueOnce({ value: [createPR(1, "alice")], count: 1 });

    // when
    const result = await repository.listContributors("token", "org", null, null);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("alice");
  });

  it("should handle empty PR responses", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [], count: 0 });

    // when
    const result = await repository.listContributors("token", "org", null, null);

    // then
    expect(result).toEqual([]);
  });

  it("should handle PR fetch failure gracefully", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 })
      .mockRejectedValueOnce(new Error("PR fetch failed"));

    // when
    const result = await repository.listContributors("token", "org", null, null);

    // then
    expect(result).toEqual([]);
  });

  it("should return empty array when no projects exist", async () => {
    // given
    mockedAdo.mockResolvedValueOnce({ value: [], count: 0 });

    // when
    const result = await repository.listContributors("token", "org", null, null);

    // then
    expect(result).toEqual([]);
  });
});
