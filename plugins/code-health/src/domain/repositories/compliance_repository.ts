import type { ComplianceStatus } from "@rios0rios0/backstage-plugin-code-health-common";

export interface ComplianceRepository {
  getComplianceStatus(
    token: string,
    owner: string,
    repoName: string,
    defaultBranch: string,
  ): Promise<ComplianceStatus | null>;
}
