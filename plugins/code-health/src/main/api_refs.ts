import { createApiRef } from "@backstage/core-plugin-api";
import type { CodeHealthConfig } from "../domain/entities/code_health_config";
import type {
  AdministrationService,
  ContributorService,
  CoverageService,
  DashboardService,
  IdentityService,
  IntegrationsService,
  OwnershipService,
  TimeSeriesService,
  TrendService,
} from "../domain/services/dashboard_service";

/** Values pinned by an administrator in `app-config.yaml`. */
export const codeHealthConfigApiRef = createApiRef<CodeHealthConfig>({
  id: "plugin.code-health.config",
});

export const codeHealthRepositoriesApiRef = createApiRef<DashboardService>({
  id: "plugin.code-health.repositories",
});

export const codeHealthContributorsApiRef = createApiRef<ContributorService>({
  id: "plugin.code-health.contributors",
});

/**
 * How much history the backend has, and the way to ask it for a run.
 *
 * This replaces the credential API the plugin used to expose. There is nothing
 * for a browser to hold any more: the backend authenticates to every provider
 * through the host application's `integrations` configuration.
 */
export const codeHealthCoverageApiRef = createApiRef<CoverageService>({
  id: "plugin.code-health.coverage",
});

/** Fleet-wide activity over time, for the Insights charts. */
export const codeHealthTimeSeriesApiRef = createApiRef<TimeSeriesService>({
  id: "plugin.code-health.time-series",
});

/**
 * Which optional integrations the backend was configured with.
 *
 * Its own ref rather than a field on the config ref: this one is answered by
 * the backend, and a view that reads it is depending on the backend being
 * reachable in a way that reading `app-config.yaml` never is.
 */
export const codeHealthIntegrationsApiRef = createApiRef<IntegrationsService>({
  id: "plugin.code-health.integrations",
});

/** The accounts the plugin has seen, and which person each one belongs to. */
export const codeHealthIdentitiesApiRef = createApiRef<IdentityService>({
  id: "plugin.code-health.identities",
});

/** One person's or one repository's history, bucketed, for the detail pages. */
export const codeHealthTrendsApiRef = createApiRef<TrendService>({
  id: "plugin.code-health.trends",
});

/** The repositories a person owns through the catalog, for the contributor page. */
export const codeHealthOwnershipApiRef = createApiRef<OwnershipService>({
  id: "plugin.code-health.ownership",
});

/**
 * What the signed-in person may do beyond reading, and the one write that
 * needs it: starting the history collection over.
 */
export const codeHealthAdministrationApiRef = createApiRef<AdministrationService>({
  id: "plugin.code-health.administration",
});
