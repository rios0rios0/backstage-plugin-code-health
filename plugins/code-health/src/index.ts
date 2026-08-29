export { CodeHealthPage, codeHealthPlugin } from "./plugin";
export { contributorsRouteRef, rootRouteRef } from "./routes";
export {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthIdentitiesApiRef,
  codeHealthIntegrationsApiRef,
  codeHealthRepositoriesApiRef,
} from "./main/api_refs";

export type { CodeHealthConfig } from "./domain/entities/code_health_config";
export type { TimeRange, TimeRangeId } from "./domain/entities/time_range";
export type {
  ContributorService,
  CoverageService,
  DashboardService,
  IdentityService,
  IntegrationsService,
} from "./domain/services/dashboard_service";

/**
 * The wire types are re-exported so a consumer embedding a table of their own
 * does not have to depend on the common package directly.
 */
export type {
  BadgeCheck,
  BadgeColor,
  BadgeStatus,
  CIState,
  ComplianceColor,
  ComplianceStatus,
  ConfluenceContributorMetrics,
  ConfluenceSpaceMetrics,
  ContributorIdentity,
  ContributorSummary,
  CoverageInfo,
  IdentityRow,
  IdentitySource,
  IntegrationCapabilities,
  IntegrationId,
  JiraContributorMetrics,
  JiraRepositoryMetrics,
  Platform,
  QualityGateStatus,
  Release,
  RepositoryActivity,
  RepositorySummary,
  SonarMetrics,
  Tag,
  WakaTimeAiMetrics,
  WakaTimeBreakdownItem,
  WakaTimeMetrics,
  WakaTimeProjectMetrics,
  WorkflowStatus,
} from "@rios0rios0/backstage-plugin-code-health-common";
