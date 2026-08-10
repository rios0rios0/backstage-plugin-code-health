import type { ComplianceStatus } from "../../src/domain/entities/compliance_status";
import type { ComplianceRepository } from "../../src/domain/repositories/compliance_repository";

export class StubComplianceRepository implements ComplianceRepository {
  private results = new Map<string, ComplianceStatus | null>();
  private error: Error | null = null;

  withComplianceStatus(repoName: string, status: ComplianceStatus | null): this {
    this.results.set(repoName, status);
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async getComplianceStatus(
    _token: string,
    _owner: string,
    repoName: string,
    _defaultBranch: string,
  ): Promise<ComplianceStatus | null> {
    if (this.error) throw this.error;
    return this.results.get(repoName) ?? null;
  }
}
