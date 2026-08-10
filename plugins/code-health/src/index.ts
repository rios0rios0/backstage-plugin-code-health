export { CodeHealthPage, codeHealthPlugin } from "./plugin";
export { contributorsRouteRef, rootRouteRef, settingsRouteRef } from "./routes";
export {
  codeHealthAuthApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthRepositoriesApiRef,
} from "./main/api_refs";

export type { BadgeCheck, BadgeColor, BadgeStatus, CIState, ComplianceColor, ComplianceStatus, Platform, QualityGateStatus, Release, SonarMetrics, Tag, WakaTimeMetrics, WorkflowStatus } from "@rios0rios0/backstage-plugin-code-health-common";
export type { Contributor } from "./domain/entities/contributor";
export type { CodeHealthConfig } from "./domain/entities/code_health_config";
export type { IntegrationTarget } from "./domain/entities/integration_target";
export type { Repository } from "./domain/entities/repository";
export type { SonarType } from "./domain/entities/sonar_type";
export type { AuthenticationService } from "./domain/services/authentication_service";
export type { ContributorService } from "./domain/services/contributor_service";
export type { DashboardService } from "./domain/services/dashboard_service";
