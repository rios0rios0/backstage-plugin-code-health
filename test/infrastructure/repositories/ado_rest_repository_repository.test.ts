import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdoRestRepositoryRepository } from "../../../src/infrastructure/repositories/ado_rest_repository_repository";

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

const createBuild = (result: string) => ({
  id: 1,
  buildNumber: "20250101.1",
  status: "completed" as const,
  result,
  finishTime: "2025-01-01T00:00:00Z",
  sourceVersion: "abc123",
  sourceBranch: "refs/heads/main",
  definition: { name: "CI" },
  _links: { web: { href: "https://dev.azure.com/org/proj/_build/results?buildId=1" } },
});

describe("AdoRestRepositoryRepository", () => {
  let repository: AdoRestRepositoryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    const stub = createStubAdoRestClient();
    mockedAdo = stub.get;
    repository = new AdoRestRepositoryRepository(stub.client);
  });

  it("should fetch repos from all projects and enrich with builds, tags, and branches", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 }) // projects
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 }) // repos
      .mockResolvedValueOnce({ value: [createBuild("succeeded")], count: 1 }) // build
      .mockResolvedValueOnce({ value: [{ name: "refs/tags/v1.0.0", objectId: "tag1", peeledObjectId: null }], count: 1 }) // tag
      .mockResolvedValueOnce({ value: [{ name: "refs/heads/main" }, { name: "refs/heads/develop" }], count: 2 }); // branches

    // when
    const result = await repository.listAll("token", "org");

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("repo1");
    expect(result[0].ciStatus?.state).toBe("SUCCESS");
    expect(result[0].branches).toContain("main");
    expect(result[0].branches).toContain("develop");
  });

  it("should skip projects where repo access fails", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1"), createProject("proj2")], count: 2 })
      .mockRejectedValueOnce(new Error("403 Forbidden")) // proj1 repos fail
      .mockResolvedValueOnce({ value: [createRepo("repo2", "proj2")], count: 1 }) // proj2 repos
      .mockResolvedValueOnce({ value: [], count: 0 }) // build
      .mockResolvedValueOnce({ value: [], count: 0 }) // tag
      .mockResolvedValueOnce({ value: [{ name: "refs/heads/main" }], count: 1 }); // branches

    // when
    const result = await repository.listAll("token", "org");

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("repo2");
  });

  it("should handle null build gracefully", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [], count: 0 }) // no builds
      .mockResolvedValueOnce({ value: [], count: 0 }) // no tags
      .mockResolvedValueOnce({ value: [{ name: "refs/heads/main" }], count: 1 });

    // when
    const result = await repository.listAll("token", "org");

    // then
    expect(result).toHaveLength(1);
    expect(result[0].ciStatus).toBeNull();
  });

  it("should handle build fetch failure gracefully", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 })
      .mockRejectedValueOnce(new Error("build error")) // build fails
      .mockResolvedValueOnce({ value: [], count: 0 }) // tag
      .mockResolvedValueOnce({ value: [{ name: "refs/heads/main" }], count: 1 });

    // when
    const result = await repository.listAll("token", "org");

    // then
    expect(result).toHaveLength(1);
    expect(result[0].ciStatus).toBeNull();
  });

  it("should handle tag and branch fetch failures gracefully", async () => {
    // given
    mockedAdo
      .mockResolvedValueOnce({ value: [createProject("proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createRepo("repo1", "proj1")], count: 1 })
      .mockResolvedValueOnce({ value: [createBuild("succeeded")], count: 1 })
      .mockRejectedValueOnce(new Error("tag error")) // tag fails
      .mockRejectedValueOnce(new Error("branch error")); // branch fails

    // when
    const result = await repository.listAll("token", "org");

    // then
    expect(result).toHaveLength(1);
    expect(result[0].latestTag).toBeNull();
    expect(result[0].branches).toEqual([]);
  });
});
