import type { CodeHealthConfig } from "../domain/entities/code_health_config";
import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import { isPlatform } from "@rios0rios0/backstage-plugin-code-health-common";
import type { SonarType } from "../domain/entities/sonar_type";
import { isSonarType, SONARCLOUD_BASE_URL } from "../domain/entities/sonar_type";
import type { AuthenticationService } from "../domain/services/authentication_service";

export const NOT_CONFIGURED_MESSAGE =
  "Code Health is not configured. Add credentials on the Settings tab, or configure `codeHealth` and a proxy endpoint in app-config.yaml.";

export interface SonarSettings {
  readonly type: SonarType;
  readonly token: string;
  readonly baseUrl: string;
  readonly organization?: string;
}

/**
 * The credentials and targets actually used for a request, after merging what an
 * administrator pinned in `app-config.yaml` with what the current user configured
 * in the plugin's Settings page. Administrator values always win.
 */
export interface EffectiveSettings {
  readonly platform: Platform | null;
  readonly organization: string | null;
  /** Empty string when the platform is reached through a Backstage proxy. */
  readonly token: string;
  readonly sonar: SonarSettings | null;
  readonly wakaTimeToken: string | null;
  readonly managedPlatform: boolean;
  readonly managedOrganization: boolean;
  readonly managedSonar: boolean;
  readonly managedWakaTime: boolean;
  /** True when enough information is available to call the platform. */
  readonly ready: boolean;
}

const resolveSonar = (
  authService: AuthenticationService,
  config: CodeHealthConfig,
  organization: string | null,
): SonarSettings | null => {
  const storedType = authService.getSonarType();
  const type: SonarType = config.sonarType ?? (isSonarType(storedType) ? storedType : "cloud");
  const organizationKey = config.sonarOrganization ?? organization ?? undefined;

  if (config.proxied.sonar) {
    return {
      type,
      token: "",
      baseUrl: config.sonarBaseUrl ?? SONARCLOUD_BASE_URL,
      organization: organizationKey,
    };
  }

  const token = authService.getSonarToken();
  if (!token) return null;

  const baseUrl =
    config.sonarBaseUrl ?? (type === "cloud" ? SONARCLOUD_BASE_URL : authService.getSonarUrl());
  if (!baseUrl) return null;

  return { type, token, baseUrl, organization: organizationKey };
};

const resolveWakaTimeToken = (
  authService: AuthenticationService,
  config: CodeHealthConfig,
): string | null => {
  if (config.proxied.wakatime) return "";
  return authService.getWakaTimeToken();
};

export const resolveSettings = (
  authService: AuthenticationService,
  config: CodeHealthConfig,
): EffectiveSettings => {
  const storedPlatform = authService.getPlatform();
  const platform = config.platform ?? (isPlatform(storedPlatform) ? storedPlatform : null);
  const organization = config.organization ?? authService.getUsername();

  const proxied = platform !== null && config.proxied[platform];
  const token = proxied ? "" : (authService.getToken() ?? "");

  return {
    platform,
    organization,
    token,
    sonar: resolveSonar(authService, config, organization),
    wakaTimeToken: resolveWakaTimeToken(authService, config),
    managedPlatform: config.platform !== null,
    managedOrganization: config.organization !== null,
    managedSonar: config.proxied.sonar || config.sonarType !== null,
    managedWakaTime: config.proxied.wakatime,
    ready: platform !== null && Boolean(organization) && (proxied || token !== ""),
  };
};
