import { describe, it, expect } from "vitest";
import type { GitforgeConfig } from "../../src/domain/entities/gitforge_config";
import { EMPTY_GITFORGE_CONFIG } from "../../src/domain/entities/gitforge_config";
import type { GitforgeClients } from "../../src/main/factories/repository_factory";
import { GitforgeContributorsApi } from "../../src/main/gitforge_contributors_api";
import { NOT_CONFIGURED_MESSAGE } from "../../src/service/settings_resolver";
import { StubAuthenticationService } from "../doubles/stub_authentication_service";
import {
  createStubAdoRestClient,
  createStubGraphQLClient,
  createStubSonarClient,
  createStubWakaTimeClient,
} from "../doubles/stub_http_clients";

const configWith = (overrides: Partial<GitforgeConfig>): GitforgeConfig => ({
  ...EMPTY_GITFORGE_CONFIG,
  ...overrides,
  proxied: { ...EMPTY_GITFORGE_CONFIG.proxied, ...overrides.proxied },
});

const pullRequestNode = {
  number: 1,
  title: "Add feature",
  state: "MERGED",
  createdAt: "2026-01-01T00:00:00Z",
  mergedAt: "2026-01-02T00:00:00Z",
  additions: 40,
  deletions: 10,
  author: { login: "alice", avatarUrl: "https://avatars/alice", url: "https://github.com/alice" },
  reviews: { nodes: [{ state: "APPROVED" }] },
  commits: { nodes: [] },
};

const searchPage = (nodes: unknown[]) => ({
  search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
});

const createHarness = () => {
  const graphQL = createStubGraphQLClient();
  const ado = createStubAdoRestClient();
  const sonar = createStubSonarClient();
  const wakaTime = createStubWakaTimeClient();

  const clients: GitforgeClients = {
    graphQLClient: graphQL.client,
    adoRestClient: ado.client,
    sonarClient: sonar.client,
    wakaTimeClient: wakaTime.client,
  };

  return { clients, graphQL, ado, sonar, wakaTime };
};

const configuredAuth = () => {
  const authService = new StubAuthenticationService();
  authService.setToken("tok");
  authService.setUsername("acme");
  authService.setPlatform("github");
  return authService;
};

describe("GitforgeContributorsApi", () => {
  it("should throw a helpful error when nothing is configured", async () => {
    // given
    const { clients } = createHarness();
    const api = new GitforgeContributorsApi({
      clients,
      authService: new StubAuthenticationService(),
      config: EMPTY_GITFORGE_CONFIG,
    });

    // when / then
    await expect(api.listContributors(null, null)).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
  });

  it("should aggregate contributors from the GitHub client", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request.mockResolvedValueOnce(searchPage([pullRequestNode]));

    const api = new GitforgeContributorsApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: EMPTY_GITFORGE_CONFIG,
    });

    // when
    const result = await api.listContributors(null, null);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("alice");
    expect(result[0].approvedPRs).toBe(1);
  });

  it("should forward the requested date range to the search query", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request.mockResolvedValueOnce(searchPage([]));

    const api = new GitforgeContributorsApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: EMPTY_GITFORGE_CONFIG,
    });

    // when
    await api.listContributors("2026-01-01", "2026-02-01");

    // then
    const [, , variables] = harness.graphQL.request.mock.calls[0];
    expect(variables.searchQuery).toContain("created:>=2026-01-01");
    expect(variables.searchQuery).toContain("created:<=2026-02-01");
  });

  it("should skip WakaTime enrichment when no token is configured", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request.mockResolvedValueOnce(searchPage([pullRequestNode]));

    const api = new GitforgeContributorsApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: EMPTY_GITFORGE_CONFIG,
    });

    // when
    const result = await api.listContributors(null, null);

    // then
    expect(harness.wakaTime.get).not.toHaveBeenCalled();
    expect(result[0].wakaTimeMetrics).toBeNull();
  });

  it("should enrich with WakaTime metrics when the integration is proxied", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request.mockResolvedValueOnce(searchPage([pullRequestNode]));
    harness.wakaTime.get
      .mockResolvedValueOnce({
        data: [{ user: { username: "alice", display_name: "alice", email: "" } }],
      })
      .mockResolvedValueOnce({ data: [{ grand_total: { total_seconds: 3600 } }] });

    const api = new GitforgeContributorsApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: configWith({ proxied: { wakatime: true } }),
    });

    // when
    const result = await api.listContributors(null, null);

    // then
    expect(harness.wakaTime.get).toHaveBeenCalledWith("", "/orgs/acme/members");
    expect(result[0].wakaTimeMetrics).toEqual({ totalSeconds: 3600, dailyAverageSeconds: 3600 });
  });

  it("should use the Azure DevOps client when the platform is azure-devops", async () => {
    // given
    const harness = createHarness();
    harness.ado.get.mockResolvedValue({ value: [], count: 0 });

    const authService = configuredAuth();
    authService.setPlatform("azure-devops");

    const api = new GitforgeContributorsApi({
      clients: harness.clients,
      authService,
      config: EMPTY_GITFORGE_CONFIG,
    });

    // when
    const result = await api.listContributors(null, null);

    // then
    expect(result).toEqual([]);
    expect(harness.ado.get).toHaveBeenCalledWith("tok", "/acme/_apis/projects?api-version=7.1");
    expect(harness.graphQL.request).not.toHaveBeenCalled();
  });
});
