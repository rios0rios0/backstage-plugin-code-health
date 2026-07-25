export { GitforgeDashboardPage, gitforgeDashboardPlugin } from "./plugin";
export { contributorsRouteRef, rootRouteRef, settingsRouteRef } from "./routes";
export {
  gitforgeAuthApiRef,
  gitforgeConfigApiRef,
  gitforgeContributorsApiRef,
  gitforgeDashboardApiRef,
} from "./main/api_refs";

export type { BadgeCheck, BadgeColor, BadgeStatus } from "./domain/entities/badge_status";
export type { ComplianceColor, ComplianceStatus } from "./domain/entities/compliance_status";
export type { Contributor } from "./domain/entities/contributor";
export type { GitforgeConfig } from "./domain/entities/gitforge_config";
export type { IntegrationTarget } from "./domain/entities/integration_target";
export type { Platform } from "./domain/entities/platform";
export type { Release } from "./domain/entities/release";
export type { Repository } from "./domain/entities/repository";
export type { QualityGateStatus, SonarMetrics } from "./domain/entities/sonar_metrics";
export type { SonarType } from "./domain/entities/sonar_type";
export type { Tag } from "./domain/entities/tag";
export type { WakaTimeMetrics } from "./domain/entities/wakatime_metrics";
export type { CIState, WorkflowStatus } from "./domain/entities/workflow_status";
export type { AuthenticationService } from "./domain/services/authentication_service";
export type { ContributorService } from "./domain/services/contributor_service";
export type { DashboardService } from "./domain/services/dashboard_service";
