import type { FetchApi } from "@backstage/core-plugin-api";
import type { EndpointResolver } from "./endpoint_resolver";

export interface SonarClient {
  /**
   * `path` is relative to the Sonar base URL, e.g. `/api/projects/search?ps=500`.
   * `baseUrlOverride` carries the SonarQube instance URL a user configured at runtime
   * and is ignored when the target is fronted by a Backstage proxy.
   */
  get<T>(token: string, baseUrlOverride: string | null, path: string): Promise<T>;
}

export class HttpSonarClient implements SonarClient {
  private readonly fetchApi: FetchApi;
  private readonly resolver: EndpointResolver;

  constructor(fetchApi: FetchApi, resolver: EndpointResolver) {
    this.fetchApi = fetchApi;
    this.resolver = resolver;
  }

  async get<T>(token: string, baseUrlOverride: string | null, path: string): Promise<T> {
    const { baseUrl, viaProxy } = await this.resolver.resolve("sonar", baseUrlOverride);

    const headers: Record<string, string> = {};
    if (!viaProxy && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await this.fetchApi.fetch(`${baseUrl}${path}`, { headers });

    if (!response.ok) {
      throw new Error(`Sonar API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
