/**
 * Types and pure helpers shared by the Code Health frontend and backend plugins.
 *
 * This package is the HTTP wire contract between them. It carries no runtime
 * dependencies and no side effects, so either side can import it freely.
 *
 * @packageDocumentation
 */

export { CODE_HEALTH_API_VERSION, CODE_HEALTH_PLUGIN_ID } from "./api";
export type {
  GetCoverageResponse,
  GetTimeSeriesResponse,
  ListContributorsResponse,
  ListRepositoriesResponse,
  RefreshResponse,
  TimeWindow,
} from "./api";

export { computeBadgeColor, parseBadgesFromReadme } from "./badge_status";
export type { BadgeCheck, BadgeColor, BadgeStatus } from "./badge_status";

export { computeComplianceColor } from "./compliance_status";
export type { ComplianceColor, ComplianceStatus } from "./compliance_status";

export { computeRate } from "./contributor_summary";
export type { ContributorSummary } from "./contributor_summary";

export { EMPTY_BACKFILL_PROGRESS } from "./coverage";
export type { BackfillProgress, CoverageInfo } from "./coverage";

export { EVENT_KINDS, isEventKind } from "./event_kind";
export type { EventKind } from "./event_kind";

export { isPlatform, PLATFORMS } from "./platform";
export type { Platform } from "./platform";

export type { Release } from "./release";

export { EMPTY_REPOSITORY_ACTIVITY } from "./repository_summary";
export type {
  RepositoryActivity,
  RepositorySummary,
  RepositoryVisibility,
} from "./repository_summary";

export type { QualityGateStatus, SonarMetrics } from "./sonar_metrics";
export { formatDebt } from "./sonar_metrics";

export type { Tag } from "./tag";

export { isTimeSeriesBucket, TIME_SERIES_BUCKETS } from "./time_series";
export type { TimeSeriesBucket, TimeSeriesPoint } from "./time_series";

export { formatDuration } from "./wakatime_metrics";
export type { WakaTimeMetrics } from "./wakatime_metrics";

export { CI_STATES, isCIState } from "./workflow_status";
export type { CIState, WorkflowStatus } from "./workflow_status";
export { catalogEntityPath, parseEntityRef } from "./entity_ref";
export type { ParsedEntityRef } from "./entity_ref";
