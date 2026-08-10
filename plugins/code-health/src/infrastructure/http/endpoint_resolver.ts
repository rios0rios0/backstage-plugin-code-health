import type { DiscoveryApi } from "@backstage/core-plugin-api";
import type { IntegrationTarget } from "../../domain/entities/integration_target";

export interface ResolvedEndpoint {
  /** Base URL every request path is appended to. */
  readonly baseUrl: string;
  /**
   * True when the request goes through a Backstage `proxy` endpoint, meaning the
   * backend attaches the credentials and the browser must not send its own.
   */
  readonly viaProxy: boolean;
}

export interface EndpointResolver {
  resolve(target: IntegrationTarget, overrideBaseUrl?: string | null): Promise<ResolvedEndpoint>;
}

export const DEFAULT_BASE_URLS: Readonly<Record<IntegrationTarget, string>> = {
  github: "https://api.github.com/graphql",
  "azure-devops": "https://dev.azure.com",
  sonar: "https://sonarcloud.io",
  wakatime: "https://wakatime.com/api/v1",
};

export interface EndpointConfig {
  readonly baseUrls: Partial<Record<IntegrationTarget, string>>;
  readonly proxyPaths: Partial<Record<IntegrationTarget, string>>;
}

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

const withLeadingSlash = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

export class BackstageEndpointResolver implements EndpointResolver {
  private readonly discoveryApi: DiscoveryApi;
  private readonly config: EndpointConfig;

  constructor(discoveryApi: DiscoveryApi, config: EndpointConfig) {
    this.discoveryApi = discoveryApi;
    this.config = config;
  }

  async resolve(
    target: IntegrationTarget,
    overrideBaseUrl?: string | null,
  ): Promise<ResolvedEndpoint> {
    const proxyPath = this.config.proxyPaths[target];
    if (proxyPath) {
      const proxyBaseUrl = await this.discoveryApi.getBaseUrl("proxy");
      return {
        baseUrl: `${trimTrailingSlash(proxyBaseUrl)}${trimTrailingSlash(withLeadingSlash(proxyPath))}`,
        viaProxy: true,
      };
    }

    const baseUrl =
      overrideBaseUrl?.trim() || this.config.baseUrls[target] || DEFAULT_BASE_URLS[target];

    return { baseUrl: trimTrailingSlash(baseUrl), viaProxy: false };
  }
}
