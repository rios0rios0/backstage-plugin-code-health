import type { ComplianceStatus } from "../../domain/entities/compliance_status";
import { computeComplianceColor } from "../../domain/entities/compliance_status";
import type { ComplianceRepository } from "../../domain/repositories/compliance_repository";
import type { GraphQLClient } from "../http/graphql_client";

const COMPLIANCE_QUERY = `
query ComplianceCheck($owner: String!, $name: String!, $expression: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) {
      ... on Blob { byteSize }
    }
    branchProtectionRules(first: 100) {
      nodes {
        pattern
        requiresStatusChecks
        requiresStrictStatusChecks
      }
    }
  }
}
`;

interface ComplianceQueryResponse {
  repository: {
    object: { byteSize: number } | null;
    branchProtectionRules: {
      nodes: {
        pattern: string;
        requiresStatusChecks: boolean;
        requiresStrictStatusChecks: boolean;
      }[];
    };
  };
}

const patternMatchesBranch = (pattern: string, branch: string): boolean => {
  if (pattern === branch) return true;
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replace(/\\\*/g, ".*")}$`);
  return regex.test(branch);
};

export class GitHubComplianceRepository implements ComplianceRepository {
  private readonly client: GraphQLClient;

  constructor(client: GraphQLClient) {
    this.client = client;
  }

  async getComplianceStatus(
    token: string,
    owner: string,
    repoName: string,
    defaultBranch: string,
  ): Promise<ComplianceStatus | null> {
    try {
      const data = await this.client.request<ComplianceQueryResponse>(token, COMPLIANCE_QUERY, {
        owner,
        name: repoName,
        expression: `HEAD:.github/workflows/default.yaml`,
      });

      const pipelineExists = data.repository.object !== null;

      const rules = data.repository.branchProtectionRules.nodes;
      const matchingRule = rules.find((r) => patternMatchesBranch(r.pattern, defaultBranch));

      const branchProtection = matchingRule !== undefined;
      const buildPolicyOnPRs = matchingRule?.requiresStatusChecks === true;
      const buildPolicyExpiration = matchingRule?.requiresStrictStatusChecks === true;

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
}
