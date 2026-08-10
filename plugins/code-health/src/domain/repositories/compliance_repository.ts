import type { ComplianceStatus } from "../entities/compliance_status";

export interface ComplianceRepository {
  getComplianceStatus(
    token: string,
    owner: string,
    repoName: string,
    defaultBranch: string,
  ): Promise<ComplianceStatus | null>;
}
