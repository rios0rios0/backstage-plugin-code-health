import { AdoComplianceRepository } from "../../../src/infrastructure/repositories/ado_compliance_repository";

import { createStubAdoRestClient } from "../../doubles/stub_http_clients";

let mockedAdoRequest: ReturnType<typeof createStubAdoRestClient>["get"];

const BUILD_VALIDATION_TYPE_ID = "0609b952-1397-4640-95ec-e00a01b2c241";

const createDefinitionsResponse = (names: string[] = []) => ({
  value: names.map((name, i) => ({ id: i + 1, name })),
});

const createPoliciesResponse = (policies: {
  typeId?: string;
  isEnabled?: boolean;
  validDuration?: number;
  refName?: string;
}[] = []) => ({
  value: policies.map((p) => ({
    isEnabled: p.isEnabled ?? true,
    isBlocking: true,
    type: { id: p.typeId ?? BUILD_VALIDATION_TYPE_ID },
    settings: {
      buildDefinitionId: 1,
      validDuration: p.validDuration ?? 720,
      scope: [{ refName: p.refName ?? "refs/heads/main", matchKind: "Exact" }],
    },
  })),
});

describe("AdoComplianceRepository", () => {
  let repository: AdoComplianceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    const stub = createStubAdoRestClient();
    mockedAdoRequest = stub.get;
    repository = new AdoComplianceRepository(stub.client);
  });

  it("should return green when all conditions are met", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["my-repo"]))
      .mockResolvedValueOnce(createPoliciesResponse([{ validDuration: 720 }]));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result).not.toBeNull();
    expect(result!.pipelineExists).toBe(true);
    expect(result!.buildPolicyOnPRs).toBe(true);
    expect(result!.buildPolicyExpiration).toBe(true);
    expect(result!.branchProtection).toBe(true);
    expect(result!.color).toBe("green");
  });

  it("should set pipelineExists to false when no matching definition", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["other-pipeline"]))
      .mockResolvedValueOnce(createPoliciesResponse([{ validDuration: 720 }]));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result!.pipelineExists).toBe(false);
    expect(result!.color).toBe("yellow");
  });

  it("should set buildPolicyOnPRs to false when no build validation policy exists", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["my-repo"]))
      .mockResolvedValueOnce(createPoliciesResponse([{ typeId: "other-type-id" }]));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result!.buildPolicyOnPRs).toBe(false);
    expect(result!.buildPolicyExpiration).toBe(false);
    expect(result!.branchProtection).toBe(true);
  });

  it("should set buildPolicyExpiration to false when validDuration is zero", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["my-repo"]))
      .mockResolvedValueOnce(createPoliciesResponse([{ validDuration: 0 }]));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result!.buildPolicyExpiration).toBe(false);
    expect(result!.color).toBe("yellow");
  });

  it("should set branchProtection to false when no policies exist for the branch", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["my-repo"]))
      .mockResolvedValueOnce(createPoliciesResponse([{ refName: "refs/heads/develop" }]));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result!.branchProtection).toBe(false);
    expect(result!.buildPolicyOnPRs).toBe(false);
    expect(result!.buildPolicyExpiration).toBe(false);
  });

  it("should return null when owner format is invalid", async () => {
    // given / when
    const result = await repository.getComplianceStatus("token", "invalid", "repo", "main");

    // then
    expect(result).toBeNull();
  });

  it("should return null when API request fails", async () => {
    // given
    mockedAdoRequest.mockRejectedValueOnce(new Error("API error"));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "repo", "main");

    // then
    expect(result).toBeNull();
  });

  it("should match pipeline name case-insensitively", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["My-Repo"]))
      .mockResolvedValueOnce(createPoliciesResponse([{ validDuration: 720 }]));

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result!.pipelineExists).toBe(true);
  });

  it("should match branch policies with Prefix matchKind", async () => {
    // given
    mockedAdoRequest
      .mockResolvedValueOnce(createDefinitionsResponse(["my-repo"]))
      .mockResolvedValueOnce({
        value: [{
          isEnabled: true,
          isBlocking: true,
          type: { id: BUILD_VALIDATION_TYPE_ID },
          settings: {
            buildDefinitionId: 1,
            validDuration: 720,
            scope: [{ refName: "refs/heads/", matchKind: "Prefix" }],
          },
        }],
      });

    // when
    const result = await repository.getComplianceStatus("token", "org/project", "my-repo", "main");

    // then
    expect(result!.branchProtection).toBe(true);
    expect(result!.buildPolicyOnPRs).toBe(true);
    expect(result!.color).toBe("green");
  });
});
