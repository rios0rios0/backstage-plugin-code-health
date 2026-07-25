import { vi } from "vitest";
import type { ConfigApi, DiscoveryApi, FetchApi } from "@backstage/core-plugin-api";
import type { IntegrationTarget } from "../../src/domain/entities/integration_target";
import type {
  EndpointResolver,
  ResolvedEndpoint,
} from "../../src/infrastructure/http/endpoint_resolver";

export const createStubFetchApi = () => {
  const fetch = vi.fn();
  return { fetchApi: { fetch } as unknown as FetchApi, fetch };
};

/** Minimal `Response` double: only the members the HTTP clients touch. */
export const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: () => Promise.resolve(body),
});

export const errorResponse = (status: number, statusText: string) => ({
  ok: false,
  status,
  statusText,
  json: () => Promise.reject(new Error("not json")),
});

export class StubEndpointResolver implements EndpointResolver {
  readonly calls: { target: IntegrationTarget; overrideBaseUrl?: string | null }[] = [];
  private readonly endpoint: ResolvedEndpoint;

  constructor(endpoint: ResolvedEndpoint) {
    this.endpoint = endpoint;
  }

  async resolve(
    target: IntegrationTarget,
    overrideBaseUrl?: string | null,
  ): Promise<ResolvedEndpoint> {
    this.calls.push({ target, overrideBaseUrl });
    return this.endpoint;
  }
}

export class StubDiscoveryApi implements DiscoveryApi {
  private readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:7007/api/proxy") {
    this.baseUrl = baseUrl;
  }

  async getBaseUrl(): Promise<string> {
    return this.baseUrl;
  }
}

/**
 * In-memory {@link ConfigApi} covering only what the plugin reads. Keys are
 * dot-separated paths, e.g. `gitforgeDashboard.github.proxyPath`.
 */
export class StubConfigApi implements Pick<ConfigApi, "has" | "getOptionalString" | "getOptionalNumber"> {
  private readonly values: Record<string, string | number>;

  constructor(values: Record<string, string | number> = {}) {
    this.values = values;
  }

  has(key: string): boolean {
    return Object.keys(this.values).some((k) => k === key || k.startsWith(`${key}.`));
  }

  getOptionalString(key: string): string | undefined {
    const value = this.values[key];
    return typeof value === "string" ? value : undefined;
  }

  getOptionalNumber(key: string): number | undefined {
    const value = this.values[key];
    return typeof value === "number" ? value : undefined;
  }
}

export const asConfigApi = (stub: StubConfigApi): ConfigApi => stub as unknown as ConfigApi;
