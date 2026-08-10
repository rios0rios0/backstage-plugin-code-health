import type { FetchApi } from "@backstage/core-plugin-api";
import type { EndpointResolver } from "./endpoint_resolver";

export interface WakaTimeClient {
  /** `path` is relative to the WakaTime API base URL, e.g. `/orgs/my-org/members`. */
  get<T>(token: string, path: string): Promise<T>;
}

export class HttpWakaTimeClient implements WakaTimeClient {
  private readonly fetchApi: FetchApi;
  private readonly resolver: EndpointResolver;

  constructor(fetchApi: FetchApi, resolver: EndpointResolver) {
    this.fetchApi = fetchApi;
    this.resolver = resolver;
  }

  async get<T>(token: string, path: string): Promise<T> {
    const { baseUrl, viaProxy } = await this.resolver.resolve("wakatime");

    const headers: Record<string, string> = {};
    if (!viaProxy && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await this.fetchApi.fetch(`${baseUrl}${path}`, { headers });

    if (!response.ok) {
      throw new Error(`WakaTime API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
