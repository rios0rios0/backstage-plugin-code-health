import type { IntegrationTarget } from "./integration_target";
import type { Platform } from "./platform";
import type { SonarType } from "./sonar_type";

/**
 * Values an administrator pinned in `app-config.yaml`. They take precedence over
 * anything a user configures in the Settings page, and the affected fields are
 * rendered read-only.
 */
export interface GitforgeConfig {
  readonly platform: Platform | null;
  readonly organization: string | null;
  readonly refreshIntervalMs: number | null;
  readonly sonarType: SonarType | null;
  readonly sonarBaseUrl: string | null;
  readonly sonarOrganization: string | null;
  /** Targets reachable through a Backstage proxy endpoint, so no browser-side token is needed. */
  readonly proxied: Readonly<Record<IntegrationTarget, boolean>>;
}

export const EMPTY_GITFORGE_CONFIG: GitforgeConfig = {
  platform: null,
  organization: null,
  refreshIntervalMs: null,
  sonarType: null,
  sonarBaseUrl: null,
  sonarOrganization: null,
  proxied: {
    github: false,
    "azure-devops": false,
    sonar: false,
    wakatime: false,
  },
};

/** A target needs a user supplied token only when it is not fronted by a proxy. */
export const requiresToken = (config: GitforgeConfig, target: IntegrationTarget): boolean =>
  !config.proxied[target];
