import type { FetchApi } from "@backstage/core-plugin-api";
import type { EndpointResolver } from "./endpoint_resolver";

export interface AdoRestClient {
  /** `path` is relative to the Azure DevOps base URL, e.g. `/my-org/_apis/projects?api-version=7.1`. */
  get<T>(token: string, path: string): Promise<T>;
}

export class HttpAdoRestClient implements AdoRestClient {
  private readonly fetchApi: FetchApi;
  private readonly resolver: EndpointResolver;

  constructor(fetchApi: FetchApi, resolver: EndpointResolver) {
    this.fetchApi = fetchApi;
    this.resolver = resolver;
  }

  async get<T>(token: string, path: string): Promise<T> {
    const { baseUrl, viaProxy } = await this.resolver.resolve("azure-devops");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!viaProxy && token) {
      headers.Authorization = `Basic ${btoa(`:${token}`)}`;
    }

    const response = await this.fetchApi.fetch(`${baseUrl}${path}`, { headers });

    if (!response.ok) {
      throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
