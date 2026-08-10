import { mapAdoRepoToRepository } from "../../../src/service/mappers/ado_repository_mapper";
import type { AdoBuildNode, AdoRefNode, AdoRepositoryNode } from "../../../src/service/mappers/ado_repository_node";

const createRepo = (overrides: Partial<AdoRepositoryNode> = {}): AdoRepositoryNode => ({
  id: "repo-1",
  name: "my-repo",
  url: "https://dev.azure.com/org/proj/_apis/git/repositories/repo-1",
  webUrl: "https://dev.azure.com/org/proj/_git/my-repo",
  project: { id: "proj-1", name: "proj", description: null, url: "", visibility: "private", state: "wellFormed" },
  defaultBranch: "refs/heads/main",
  isFork: false,
  isDisabled: false,
  size: 1024,
  ...overrides,
});

const createBuild = (overrides: Partial<AdoBuildNode> = {}): AdoBuildNode => ({
  id: 100,
  buildNumber: "20260320.1",
  status: "completed",
  result: "succeeded",
  finishTime: "2026-03-20T10:00:00Z",
  sourceVersion: "abc123",
  sourceBranch: "refs/heads/main",
  definition: { name: "CI" },
  _links: { web: { href: "https://dev.azure.com/org/proj/_build/results?buildId=100" } },
  ...overrides,
});

const createTag = (overrides: Partial<AdoRefNode> = {}): AdoRefNode => ({
  name: "refs/tags/v1.0.0",
  objectId: "tag-sha-1",
  peeledObjectId: "commit-sha-1",
  ...overrides,
});

describe("mapAdoRepoToRepository", () => {
  it("should map a repo with a successful build and tag", () => {
    // given
    const repo = createRepo();
    const build = createBuild();
    const tag = createTag();

    // when
    const result = mapAdoRepoToRepository(repo, build, tag, "org", ["main", "develop", "feat/x"]);

    // then
    expect(result.name).toBe("my-repo");
    expect(result.fullName).toBe("org/proj/my-repo");
    expect(result.url).toBe("https://dev.azure.com/org/proj/_git/my-repo");
    expect(result.visibility).toBe("PRIVATE");
    expect(result.defaultBranch).toBe("main");
    expect(result.hasWorkflows).toBe(true);
    expect(result.ciStatus?.state).toBe("SUCCESS");
    expect(result.latestTag?.name).toBe("v1.0.0");
    expect(result.latestTag?.commitSha).toBe("commit-sha-1");
    expect(result.latestRelease).toBeNull();
    expect(result.primaryLanguage).toBeNull();
    expect(result.branches).toEqual(["main", "develop", "feat/x"]);
    expect(result.complianceStatus).toBeNull();
    expect(result.badgeStatus).toBeNull();
  });

  it("should map build result 'failed' to FAILURE", () => {
    // given
    const build = createBuild({ result: "failed" });

    // when
    const result = mapAdoRepoToRepository(createRepo(), build, null, "org");

    // then
    expect(result.ciStatus?.state).toBe("FAILURE");
  });

  it("should map build result 'canceled' to ERROR", () => {
    // given
    const build = createBuild({ result: "canceled" });

    // when
    const result = mapAdoRepoToRepository(createRepo(), build, null, "org");

    // then
    expect(result.ciStatus?.state).toBe("ERROR");
  });

  it("should map in-progress build to PENDING", () => {
    // given
    const build = createBuild({ status: "inProgress", result: null });

    // when
    const result = mapAdoRepoToRepository(createRepo(), build, null, "org");

    // then
    expect(result.ciStatus?.state).toBe("PENDING");
  });

  it("should map null build to no CI", () => {
    // when
    const result = mapAdoRepoToRepository(createRepo(), null, null, "org");

    // then
    expect(result.ciStatus).toBeNull();
    expect(result.hasWorkflows).toBe(false);
  });

  it("should map disabled repo as archived", () => {
    // given
    const repo = createRepo({ isDisabled: true });

    // when
    const result = mapAdoRepoToRepository(repo, null, null, "org");

    // then
    expect(result.isArchived).toBe(true);
  });

  it("should map public project visibility", () => {
    // given
    const repo = createRepo({
      project: { id: "p", name: "proj", description: null, url: "", visibility: "public", state: "wellFormed" },
    });

    // when
    const result = mapAdoRepoToRepository(repo, null, null, "org");

    // then
    expect(result.visibility).toBe("PUBLIC");
  });

  it("should strip refs/heads/ prefix from default branch", () => {
    // given
    const repo = createRepo({ defaultBranch: "refs/heads/develop" });

    // when
    const result = mapAdoRepoToRepository(repo, null, null, "org");

    // then
    expect(result.defaultBranch).toBe("develop");
  });
});
