import { GitHubComplianceRepository } from "../../../src/infrastructure/repositories/github_compliance_repository";

import { createStubGraphQLClient } from "../../doubles/stub_http_clients";

let mockedGraphql: ReturnType<typeof createStubGraphQLClient>["request"];

const createResponse = (overrides: {
  object?: { byteSize: number } | null;
  branchProtectionRules?: { nodes: { pattern: string; requiresStatusChecks: boolean; requiresStrictStatusChecks: boolean }[] };
} = {}) => ({
  repository: {
    object: "object" in overrides ? overrides.object : { byteSize: 100 },
    branchProtectionRules: overrides.branchProtectionRules ?? {
      nodes: [{
        pattern: "main",
        requiresStatusChecks: true,
        requiresStrictStatusChecks: true,
      }],
    },
  },
});

describe("GitHubComplianceRepository", () => {
  let repository: GitHubComplianceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    const stub = createStubGraphQLClient();
    mockedGraphql = stub.request;
    repository = new GitHubComplianceRepository(stub.client);
  });

  it("should return green when all conditions are met", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse());

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result).not.toBeNull();
    expect(result!.pipelineExists).toBe(true);
    expect(result!.buildPolicyOnPRs).toBe(true);
    expect(result!.buildPolicyExpiration).toBe(true);
    expect(result!.branchProtection).toBe(true);
    expect(result!.color).toBe("green");
  });

  it("should set pipelineExists to false when workflow file does not exist", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({ object: null }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result!.pipelineExists).toBe(false);
    expect(result!.color).toBe("yellow");
  });

  it("should set branchProtection to false when no rules match the default branch", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({
      branchProtectionRules: {
        nodes: [{ pattern: "release/*", requiresStatusChecks: true, requiresStrictStatusChecks: true }],
      },
    }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result!.branchProtection).toBe(false);
    expect(result!.buildPolicyOnPRs).toBe(false);
    expect(result!.buildPolicyExpiration).toBe(false);
    expect(result!.color).toBe("red");
  });

  it("should set buildPolicyOnPRs to false when requiresStatusChecks is false", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({
      branchProtectionRules: {
        nodes: [{ pattern: "main", requiresStatusChecks: false, requiresStrictStatusChecks: true }],
      },
    }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result!.branchProtection).toBe(true);
    expect(result!.buildPolicyOnPRs).toBe(false);
    expect(result!.color).toBe("yellow");
  });

  it("should set buildPolicyExpiration to false when requiresStrictStatusChecks is false", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({
      branchProtectionRules: {
        nodes: [{ pattern: "main", requiresStatusChecks: true, requiresStrictStatusChecks: false }],
      },
    }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result!.buildPolicyExpiration).toBe(false);
    expect(result!.color).toBe("yellow");
  });

  it("should match wildcard branch protection patterns", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({
      branchProtectionRules: {
        nodes: [{ pattern: "*", requiresStatusChecks: true, requiresStrictStatusChecks: true }],
      },
    }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result!.branchProtection).toBe(true);
    expect(result!.color).toBe("green");
  });

  it("should return null when GraphQL request fails", async () => {
    // given
    mockedGraphql.mockRejectedValueOnce(new Error("API error"));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result).toBeNull();
  });

  it("should handle patterns with regex metacharacters safely", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({
      branchProtectionRules: {
        nodes: [{ pattern: "release/1.0", requiresStatusChecks: true, requiresStrictStatusChecks: true }],
      },
    }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "release/1.0");

    // then
    expect(result!.branchProtection).toBe(true);
    expect(result!.color).toBe("green");
  });

  it("should return red when no branch protection and no workflow file", async () => {
    // given
    mockedGraphql.mockResolvedValueOnce(createResponse({
      object: null,
      branchProtectionRules: { nodes: [] },
    }));

    // when
    const result = await repository.getComplianceStatus("token", "owner", "repo", "main");

    // then
    expect(result!.pipelineExists).toBe(false);
    expect(result!.branchProtection).toBe(false);
    expect(result!.buildPolicyOnPRs).toBe(false);
    expect(result!.buildPolicyExpiration).toBe(false);
    expect(result!.color).toBe("red");
  });
});
