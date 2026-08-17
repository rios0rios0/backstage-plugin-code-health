import { createApiRef } from "@backstage/core-plugin-api";
import type { CodeHealthConfig } from "../domain/entities/code_health_config";
import type {
  ContributorService,
  CoverageService,
  DashboardService,
  TimeSeriesService,
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
