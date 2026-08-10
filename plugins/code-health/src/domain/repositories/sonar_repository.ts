import type { SonarMetrics } from "../entities/sonar_metrics";

export interface AuthorIssues {
  bugs: number;
  codeSmells: number;
  vulnerabilities: number;
  securityHotspots: number;
}

export interface SonarRepository {
  listProjectKeys(): Promise<string[]>;
  getProjectMetrics(projectKey: string): Promise<SonarMetrics | null>;
  getIssuesByAuthor(projectKey: string): Promise<Map<string, AuthorIssues>>;
}
