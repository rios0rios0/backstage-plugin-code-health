import type { SonarMetrics } from "@rios0rios0/backstage-plugin-code-health-common";

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
