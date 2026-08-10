import type { SonarMetrics, WakaTimeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";

export interface Contributor {
  readonly username: string;
  readonly avatarUrl: string;
  readonly profileUrl: string;
  readonly approvedPRs: number;
  readonly totalPRs: number;
  readonly rejectedPRs: number;
  readonly linesOfCode: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly prApprovalRate: number;
  readonly pipelineSuccessRate: number;
  readonly totalPipelineRuns: number;
  readonly successfulPipelineRuns: number;
  readonly sonarMetrics: SonarMetrics | null;
  readonly wakaTimeMetrics: WakaTimeMetrics | null;
}
