import type { SonarMetrics } from "../../src/domain/entities/sonar_metrics";
import type { AuthorIssues, SonarRepository } from "../../src/domain/repositories/sonar_repository";

export class StubSonarRepository implements SonarRepository {
  private projectKeys: string[] = [];
  private projectMetrics: Map<string, SonarMetrics | null> = new Map();
  private authorIssues: Map<string, Map<string, AuthorIssues>> = new Map();

  withProjectKeys(keys: string[]): this {
    this.projectKeys = keys;
    return this;
  }

  withProjectMetrics(key: string, metrics: SonarMetrics | null): this {
    this.projectMetrics.set(key, metrics);
    return this;
  }

  withAuthorIssues(projectKey: string, issues: Map<string, AuthorIssues>): this {
    this.authorIssues.set(projectKey, issues);
    return this;
  }

  async listProjectKeys(): Promise<string[]> {
    return this.projectKeys;
  }

  async getProjectMetrics(projectKey: string): Promise<SonarMetrics | null> {
    return this.projectMetrics.get(projectKey) ?? null;
  }

  async getIssuesByAuthor(projectKey: string): Promise<Map<string, AuthorIssues>> {
    return this.authorIssues.get(projectKey) ?? new Map();
  }
}
