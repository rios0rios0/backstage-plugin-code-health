import type { BadgeStatus, ComplianceStatus, Release, SonarMetrics, Tag, WorkflowStatus } from "@rios0rios0/backstage-plugin-code-health-common";

export interface Repository {
  readonly id: string;
  readonly name: string;
  readonly fullName: string;
  readonly url: string;
  readonly description: string | null;
  readonly primaryLanguage: string | null;
  readonly visibility: "PUBLIC" | "PRIVATE";
  readonly isArchived: boolean;
  readonly isFork: boolean;
  readonly defaultBranch: string;
  readonly updatedAt: string;
  readonly ciStatus: WorkflowStatus | null;
  readonly latestRelease: Release | null;
  readonly latestTag: Tag | null;
  readonly hasWorkflows: boolean;
  readonly branches: string[];
  readonly sonarMetrics: SonarMetrics | null;
  readonly complianceStatus: ComplianceStatus | null;
  readonly badgeStatus: BadgeStatus | null;
}
