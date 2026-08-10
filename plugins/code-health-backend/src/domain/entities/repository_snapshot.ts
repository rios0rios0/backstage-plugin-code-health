import type {
  BadgeStatus,
  ComplianceStatus,
  Release,
  RepositoryVisibility,
  SonarMetrics,
  Tag,
  WakaTimeMetrics,
  WorkflowStatus,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * The current state of a repository on one day.
 *
 * None of this can be backfilled: no provider exposes what a repository's
 * compliance checks, README badges or Sonar measures looked like last March.
 * The series therefore starts at the first snapshot after installation, and the
 * dashboard has to say so rather than draw a flat line back through a year it
 * never observed.
 */
export interface RepositorySnapshotPayload {
  readonly description: string | null;
  readonly primaryLanguage: string | null;
  readonly visibility: RepositoryVisibility;
  readonly isArchived: boolean;
  readonly isFork: boolean;
  readonly defaultBranch: string;
  readonly updatedAt: string;
  readonly ciStatus: WorkflowStatus | null;
  readonly latestRelease: Release | null;
  readonly latestTag: Tag | null;
  readonly branches: readonly string[];
  readonly complianceStatus: ComplianceStatus | null;
  readonly badgeStatus: BadgeStatus | null;
  readonly sonarMetrics: SonarMetrics | null;
  readonly wakaTimeMetrics: WakaTimeMetrics | null;
}

export interface RepositorySnapshot {
  readonly repositoryId: string;
  /** Day the snapshot describes, as `YYYY-MM-DD`. */
  readonly day: string;
  readonly capturedAt: Date;
  readonly payload: RepositorySnapshotPayload;
}
