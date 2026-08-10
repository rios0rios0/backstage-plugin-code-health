import type { DiscoveryApi, FetchApi } from "@backstage/core-plugin-api";
import type {
  ContributorSummary,
  CoverageInfo,
  ListContributorsResponse,
  ListRepositoriesResponse,
  RepositorySummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  CODE_HEALTH_API_VERSION,
  CODE_HEALTH_PLUGIN_ID,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type {
  ContributorService,
  CoverageService,
  DashboardService,
} from "../../domain/services/dashboard_service";

export interface CodeHealthBackendClientOptions {
  readonly discoveryApi: DiscoveryApi;
  readonly fetchApi: FetchApi;
}

/**
 * The only thing the browser talks to.
 *
 * Every provider call now happens in the backend, on a schedule, once for the
 * whole organisation. What used to be thousands of requests per dashboard load
 * — five per repository against Azure DevOps, plus compliance and badge
 * lookups, repeated for every user and every tab switch — is one request here.
 *
 * `fetchApi` already attaches the caller's Backstage identity token, so there is
 * no credential to hold and nothing to store in the browser.
 */
export class CodeHealthBackendClient
  implements DashboardService, ContributorService, CoverageService
{
  constructor(private readonly options: CodeHealthBackendClientOptions) {}

  async listRepositories(window: TimeWindow): Promise<RepositorySummary[]> {
    const body = await this.get<ListRepositoriesResponse>("repositories", {
      from: window.from,
      to: window.to,
    });
    return [...body.items];
  }

  async listContributors(
    window: TimeWindow,
    repositoryId?: string,
  ): Promise<ContributorSummary[]> {
    const body = await this.get<ListContributorsResponse>("contributors", {
      from: window.from,
      to: window.to,
      ...(repositoryId === undefined ? {} : { repositoryId }),
    });
    return [...body.items];
  }

  async getCoverage(): Promise<CoverageInfo> {
    return this.get<CoverageInfo>("coverage", {});
  }

  async refresh(): Promise<void> {
    const baseUrl = await this.baseUrl();
    const response = await this.options.fetchApi.fetch(
      `${baseUrl}/${CODE_HEALTH_API_VERSION}/refresh`,
      { method: "POST" },
    );
    if (!response.ok) throw await this.toError(response, "refresh");
  }

  /**
   * Resolved immediately before each request rather than held.
   *
   * The discovery API is documented as something to call per request; a base URL
   * captured at construction goes stale whenever the backend moves, and the
   * failure looks like the plugin being uninstalled.
   */
  private async baseUrl(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl(CODE_HEALTH_PLUGIN_ID);
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const baseUrl = await this.baseUrl();
    const parameters = new URLSearchParams(query);
    const suffix = parameters.toString() === "" ? "" : `?${parameters.toString()}`;

    const response = await this.options.fetchApi.fetch(
      `${baseUrl}/${CODE_HEALTH_API_VERSION}/${path}${suffix}`,
    );
    if (!response.ok) throw await this.toError(response, path);

    return (await response.json()) as T;
  }

  /**
   * Turns a failure into something a person can act on.
   *
   * Backstage errors carry a message explaining what was wrong with the request;
   * surfacing that beats "request failed with 400", which tells a user nothing
   * about the range they picked.
   */
  private async toError(response: Response, path: string): Promise<Error> {
    const fallback = `code-health request to ${path} failed with ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      return new Error(body.error?.message ?? fallback);
    } catch {
      return new Error(fallback);
    }
  }
}
