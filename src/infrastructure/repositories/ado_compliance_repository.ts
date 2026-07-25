import type { ComplianceStatus } from "../../domain/entities/compliance_status";
import { computeComplianceColor } from "../../domain/entities/compliance_status";
import type { ComplianceRepository } from "../../domain/repositories/compliance_repository";
import type { AdoRestClient } from "../http/ado_rest_client";

const API_VERSION = "api-version=7.1";
const BUILD_VALIDATION_TYPE_ID = "0609b952-1397-4640-95ec-e00a01b2c241";

interface AdoBuildDefinition {
  readonly id: number;
  readonly name: string;
}

interface AdoPolicyConfiguration {
  readonly isEnabled: boolean;
  readonly isBlocking: boolean;
  readonly type: { readonly id: string };
  readonly settings: {
    readonly buildDefinitionId?: number;
    readonly validDuration?: number;
    readonly scope: readonly { readonly refName: string; readonly matchKind: string }[];
  };
}

interface AdoListResponse<T> {
  readonly value: T[];
}

export class AdoComplianceRepository implements ComplianceRepository {
  private readonly client: AdoRestClient;

  constructor(client: AdoRestClient) {
    this.client = client;
  }

  async getComplianceStatus(
    token: string,
    owner: string,
    repoName: string,
    defaultBranch: string,
  ): Promise<ComplianceStatus | null> {
    try {
      const [org, project] = owner.split("/");
      if (!org || !project) return null;

      const [definitions, policies] = await Promise.all([
        this.fetchBuildDefinitions(token, org, project, repoName),
        this.fetchPolicyConfigurations(token, org, project),
      ]);

      const pipelineExists = definitions.some(
        (d) => d.name.toLowerCase() === repoName.toLowerCase(),
      );

      const branchRef = `refs/heads/${defaultBranch}`;
      const scopeMatchesBranch = (scope: { readonly refName: string; readonly matchKind: string }): boolean => {
        const { refName, matchKind } = scope;
        if (!matchKind || matchKind === "Exact") return refName === branchRef;
        if (matchKind === "Prefix") return branchRef.startsWith(refName);
        return refName === branchRef;
      };
      const branchPolicies = policies.filter((p) =>
        p.isEnabled && p.settings.scope.some(scopeMatchesBranch),
      );

      const branchProtection = branchPolicies.length > 0;

      const buildValidationPolicies = branchPolicies.filter(
        (p) => p.type.id === BUILD_VALIDATION_TYPE_ID,
      );
      const buildPolicyOnPRs = buildValidationPolicies.length > 0;
      const buildPolicyExpiration = buildValidationPolicies.some(
        (p) => (p.settings.validDuration ?? 0) > 0,
      );

      const checks = [pipelineExists, buildPolicyOnPRs, buildPolicyExpiration, branchProtection];
      return {
        pipelineExists,
        buildPolicyOnPRs,
        buildPolicyExpiration,
        branchProtection,
        color: computeComplianceColor(checks),
      };
    } catch {
      return null;
    }
  }

  private async fetchBuildDefinitions(
    token: string,
    org: string,
    project: string,
    name: string,
  ): Promise<AdoBuildDefinition[]> {
    const path = `/${org}/${project}/_apis/build/definitions?name=${encodeURIComponent(name)}&${API_VERSION}`;
    const response = await this.client.get<AdoListResponse<AdoBuildDefinition>>(token, path);
    return response.value;
  }

  private async fetchPolicyConfigurations(
    token: string,
    org: string,
    project: string,
  ): Promise<AdoPolicyConfiguration[]> {
    const path = `/${org}/${project}/_apis/policy/configurations?${API_VERSION}`;
    const response = await this.client.get<AdoListResponse<AdoPolicyConfiguration>>(token, path);
    return response.value;
  }
}
