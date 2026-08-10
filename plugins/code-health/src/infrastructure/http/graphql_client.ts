import type { FetchApi } from "@backstage/core-plugin-api";
import type { EndpointResolver } from "./endpoint_resolver";

export interface GraphQLResponse<T> {
  data: T;
  errors?: { message: string }[];
}

export interface GraphQLClient {
  request<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T>;
}

export class HttpGraphQLClient implements GraphQLClient {
  private readonly fetchApi: FetchApi;
  private readonly resolver: EndpointResolver;

  constructor(fetchApi: FetchApi, resolver: EndpointResolver) {
    this.fetchApi = fetchApi;
    this.resolver = resolver;
  }

  async request<T>(
    token: string,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const { baseUrl, viaProxy } = await this.resolver.resolve("github");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!viaProxy && token) {
      headers.Authorization = `bearer ${token}`;
    }

    const response = await this.fetchApi.fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as GraphQLResponse<T>;

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
    }

    return json.data;
  }
}
