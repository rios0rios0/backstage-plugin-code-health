import type {
  BadgeStatus,
  ComplianceStatus,
  ConfluenceSpaceMetrics,
  JiraRepositoryMetrics,
  Release,
  RepositoryVisibility,
  SonarMetrics,
  Tag,
  WorkflowStatus,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * What the repository's own file tree says about documentation and APIs.
 *
 * Read from the provider at snapshot time rather than inferred from the catalog:
 * the whole value of the documentation metric is telling "never wrote any" apart
 * from "wrote some and never published it", and only the repository knows which.
 *
 * Detection is deliberately shallow — the root, `docs/` and `api/` — so it costs
 * the same on both platforms and cannot be made expensive by a repository with
 * a hundred thousand files.
 */
export interface RepositoryFileFacts {
  readonly hasReadme: boolean;
  /** A `docs/` tree with content, or an `mkdocs.yml`. */
  readonly hasDocsSource: boolean;
  /** Path of the first API definition found, or null when there is none. */
  readonly apiDefinitionPath: string | null;
}

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
  /**
   * Delivery and knowledge measures for the repository, or null when its entity
   * names no Jira project or Confluence space. Null means "nothing to look at",
   * which is a different statement from a project that closed no tickets.
   */
  readonly jiraMetrics: JiraRepositoryMetrics | null;
  readonly confluenceMetrics: ConfluenceSpaceMetrics | null;
  /**
   * Null on a snapshot written before this field existed, which is why every
   * reader treats it as "not measured" rather than as "nothing found".
   */
  readonly repositoryFiles: RepositoryFileFacts | null;
}

export interface RepositorySnapshot {
  readonly repositoryId: string;
  /** Day the snapshot describes, as `YYYY-MM-DD`. */
  readonly day: string;
  readonly capturedAt: Date;
  readonly payload: RepositorySnapshotPayload;
}
