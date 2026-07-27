import { createApiRef } from "@backstage/core-plugin-api";
import type { CodeHealthConfig } from "../domain/entities/code_health_config";
import type { AsyncAuthenticationService } from "../domain/services/authentication_service";
import type { ContributorService } from "../domain/services/contributor_service";
import type { DashboardService } from "../domain/services/dashboard_service";

/** Per-user credentials, encrypted in the browser with Web Crypto AES-GCM. */
export const codeHealthAuthApiRef = createApiRef<AsyncAuthenticationService>({
  id: "plugin.code-health.auth",
});

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
