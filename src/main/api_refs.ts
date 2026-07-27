import { createApiRef } from "@backstage/core-plugin-api";
import type { GitforgeConfig } from "../domain/entities/gitforge_config";
import type { AsyncAuthenticationService } from "../domain/services/authentication_service";
import type { ContributorService } from "../domain/services/contributor_service";
import type { DashboardService } from "../domain/services/dashboard_service";

/** Per-user credentials, encrypted in the browser with Web Crypto AES-GCM. */
export const gitforgeAuthApiRef = createApiRef<AsyncAuthenticationService>({
  id: "plugin.gitforge-dashboard.auth",
});

/** Values pinned by an administrator in `app-config.yaml`. */
export const gitforgeConfigApiRef = createApiRef<GitforgeConfig>({
  id: "plugin.gitforge-dashboard.config",
});

export const gitforgeDashboardApiRef = createApiRef<DashboardService>({
  id: "plugin.gitforge-dashboard.dashboard",
});

export const gitforgeContributorsApiRef = createApiRef<ContributorService>({
  id: "plugin.gitforge-dashboard.contributors",
});
