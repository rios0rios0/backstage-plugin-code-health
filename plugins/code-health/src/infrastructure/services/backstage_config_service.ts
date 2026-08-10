import type { ConfigApi } from "@backstage/core-plugin-api";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import { EMPTY_CODE_HEALTH_CONFIG } from "../../domain/entities/code_health_config";
import type { IntegrationTarget } from "../../domain/entities/integration_target";
import { INTEGRATION_TARGETS } from "../../domain/entities/integration_target";
import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import type { SonarType } from "../../domain/entities/sonar_type";
import { isSonarType, SONARCLOUD_BASE_URL } from "../../domain/entities/sonar_type";
import type { EndpointConfig } from "../http/endpoint_resolver";

const ROOT_KEY = "codeHealth";

/** Config sub-key holding the settings of each integration target. */
const TARGET_KEYS: Readonly<Record<IntegrationTarget, string>> = {
  github: "github",
  "azure-devops": "azureDevOps",
  sonar: "sonar",
  wakatime: "wakaTime",
};

const isPlatform = (value: string | undefined): value is Platform =>
  value === "github" || value === "azure-devops";

const readString = (configApi: ConfigApi, key: string): string | null =>
  configApi.getOptionalString(`${ROOT_KEY}.${key}`)?.trim() || null;

export const readEndpointConfig = (configApi: ConfigApi): EndpointConfig => {
  const baseUrls: EndpointConfig["baseUrls"] = {};
  const proxyPaths: EndpointConfig["proxyPaths"] = {};

  for (const target of INTEGRATION_TARGETS) {
    const baseUrl = readString(configApi, `${TARGET_KEYS[target]}.baseUrl`);
    if (baseUrl) baseUrls[target] = baseUrl;

    const proxyPath = readString(configApi, `${TARGET_KEYS[target]}.proxyPath`);
    if (proxyPath) proxyPaths[target] = proxyPath;
  }

  return { baseUrls, proxyPaths };
};

const readSonarBaseUrl = (configApi: ConfigApi, sonarType: SonarType | null): string | null => {
  const configured = readString(configApi, `${TARGET_KEYS.sonar}.baseUrl`);
  if (configured) return configured;
  return sonarType === "cloud" ? SONARCLOUD_BASE_URL : null;
};

export const readCodeHealthConfig = (configApi: ConfigApi): CodeHealthConfig => {
  if (!configApi.has(ROOT_KEY)) return EMPTY_CODE_HEALTH_CONFIG;

  const platform = configApi.getOptionalString(`${ROOT_KEY}.platform`)?.trim();
  const sonarTypeRaw = readString(configApi, `${TARGET_KEYS.sonar}.type`);
  const sonarType = isSonarType(sonarTypeRaw) ? sonarTypeRaw : null;
  const { proxyPaths } = readEndpointConfig(configApi);

  return {
    platform: isPlatform(platform) ? platform : null,
    organization: readString(configApi, "organization"),
    refreshIntervalMs: configApi.getOptionalNumber(`${ROOT_KEY}.refreshIntervalMs`) ?? null,
    sonarType,
    sonarBaseUrl: readSonarBaseUrl(configApi, sonarType),
    sonarOrganization: readString(configApi, `${TARGET_KEYS.sonar}.organization`),
    proxied: {
      github: Boolean(proxyPaths.github),
      "azure-devops": Boolean(proxyPaths["azure-devops"]),
      sonar: Boolean(proxyPaths.sonar),
      wakatime: Boolean(proxyPaths.wakatime),
    },
  };
};
