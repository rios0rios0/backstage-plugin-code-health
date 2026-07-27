import { mapGraphQLNodeToRepository } from "../../../src/service/mappers/graphql_repository_mapper";
import type { GraphQLRepositoryNode } from "../../../src/service/mappers/graphql_repository_node";

const createNode = (overrides: Partial<GraphQLRepositoryNode> = {}): GraphQLRepositoryNode => ({
  id: "node-1",
  name: "test-repo",
  nameWithOwner: "user/test-repo",
  url: "https://github.com/user/test-repo",
  description: "A test repo",
  visibility: "PUBLIC",
  isArchived: false,
  isFork: false,
  updatedAt: "2026-01-15T10:00:00Z",
  primaryLanguage: { name: "TypeScript" },
  defaultBranchRef: {
    name: "main",
    target: {
      oid: "abc123",
      messageHeadline: "initial commit",
      commitUrl: "https://github.com/user/test-repo/commit/abc123",
      statusCheckRollup: { state: "SUCCESS" },
    },
  },
  latestRelease: {
    tagName: "v1.0.0",
    name: "Release 1.0.0",
    publishedAt: "2026-01-10T00:00:00Z",
    url: "https://github.com/user/test-repo/releases/tag/v1.0.0",
    isPrerelease: false,
  },
  refs: {
    nodes: [{ name: "v1.0.0", target: { oid: "def456" } }],
  },
  branchRefs: {
    nodes: [{ name: "main" }, { name: "develop" }],
  },
  ...overrides,
});

describe("mapGraphQLNodeToRepository", () => {
  it("should map GraphQL node to Repository entity when all fields are present", () => {
    // given
    const node = createNode();

    // when
    const result = mapGraphQLNodeToRepository(node);

    // then
    expect(result.id).toBe("node-1");
    expect(result.name).toBe("test-repo");
    expect(result.fullName).toBe("user/test-repo");
    expect(result.primaryLanguage).toBe("TypeScript");
    expect(result.ciStatus?.state).toBe("SUCCESS");
    expect(result.latestRelease?.tagName).toBe("v1.0.0");
    expect(result.latestTag?.name).toBe("v1.0.0");
    expect(result.hasWorkflows).toBe(true);
    expect(result.complianceStatus).toBeNull();
    expect(result.badgeStatus).toBeNull();
  });

  it("should set ciStatus to null when defaultBranchRef is null", () => {
    // given
    const node = createNode({ defaultBranchRef: null });

    // when
    const result = mapGraphQLNodeToRepository(node);

    // then
    expect(result.ciStatus).toBeNull();
    expect(result.defaultBranch).toBe("main");
  });

  it("should set ciStatus to null when statusCheckRollup is null", () => {
    // given
    const node = createNode({
      defaultBranchRef: {
        name: "main",
        target: {
          oid: "abc123",
          messageHeadline: "commit",
          commitUrl: "https://github.com/user/test-repo/commit/abc123",
          statusCheckRollup: null,
        },
      },
    });

    // when
    const result = mapGraphQLNodeToRepository(node);

    // then
    expect(result.ciStatus).toBeNull();
  });

  it("should set latestRelease to null when no release exists", () => {
    // given
    const node = createNode({ latestRelease: null });

    // when
    const result = mapGraphQLNodeToRepository(node);

    // then
    expect(result.latestRelease).toBeNull();
  });

  it("should set latestTag to null when no tags exist", () => {
    // given
    const node = createNode({ refs: { nodes: [] } });

    // when
    const result = mapGraphQLNodeToRepository(node);

    // then
    expect(result.latestTag).toBeNull();
  });

  it("should set primaryLanguage to null when not specified", () => {
    // given
    const node = createNode({ primaryLanguage: null });

    // when
    const result = mapGraphQLNodeToRepository(node);

    // then
    expect(result.primaryLanguage).toBeNull();
  });
});
