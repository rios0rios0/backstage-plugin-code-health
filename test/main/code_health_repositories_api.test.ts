import { EMPTY_CODE_HEALTH_CONFIG } from "../../src/domain/entities/code_health_config";
import type { CodeHealthClients } from "../../src/main/factories/repository_factory";
import { CodeHealthRepositoriesApi } from "../../src/main/code_health_repositories_api";
import { NOT_CONFIGURED_MESSAGE } from "../../src/service/settings_resolver";
import { StubAuthenticationService } from "../doubles/stub_authentication_service";
import {
  createStubAdoRestClient,
  createStubGraphQLClient,
  createStubSonarClient,
  createStubWakaTimeClient,
} from "../doubles/stub_http_clients";
import { aCodeHealthConfig } from "../builders/code_health_config_builder";

const singlePage = (nodes: unknown[]) => ({
  user: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
});

const repositoryNode = {
  id: "R_1",
  name: "my-repo",
  nameWithOwner: "acme/my-repo",
  url: "https://github.com/acme/my-repo",
  description: null,
  visibility: "PUBLIC",
  isArchived: false,
  isFork: false,
  updatedAt: "2026-01-01T00:00:00Z",
  primaryLanguage: null,
  defaultBranchRef: null,
  latestRelease: null,
  refs: { nodes: [] },
  branchRefs: { nodes: [] },
};

const createHarness = () => {
  const graphQL = createStubGraphQLClient();
  const ado = createStubAdoRestClient();
  const sonar = createStubSonarClient();
  const wakaTime = createStubWakaTimeClient();

  const clients: CodeHealthClients = {
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

describe("CodeHealthRepositoriesApi", () => {
  it("should throw a helpful error when nothing is configured", async () => {
    // given
    const { clients } = createHarness();
    const api = new CodeHealthRepositoriesApi({
      clients,
      authService: new StubAuthenticationService(),
      config: EMPTY_CODE_HEALTH_CONFIG,
    });

    // when / then
    await expect(api.listRepositories()).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
  });

  it("should list repositories through the GitHub client when the platform is github", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request
      .mockResolvedValueOnce(singlePage([repositoryNode]))
      .mockResolvedValue({ repository: { object: null, branchProtectionRules: { nodes: [] } } });

    const api = new CodeHealthRepositoriesApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: EMPTY_CODE_HEALTH_CONFIG,
    });

    // when
    const result = await api.listRepositories();

    // then
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe("acme/my-repo");
    expect(harness.ado.get).not.toHaveBeenCalled();
  });

  it("should pass the resolved token and organization to the platform repository", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request
      .mockResolvedValueOnce(singlePage([]))
      .mockResolvedValue({ repository: { object: null, branchProtectionRules: { nodes: [] } } });

    const api = new CodeHealthRepositoriesApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: EMPTY_CODE_HEALTH_CONFIG,
    });

    // when
    await api.listRepositories();

    // then
    const [token, , variables] = harness.graphQL.request.mock.calls[0];
    expect(token).toBe("tok");
    expect(variables).toEqual({ username: "acme", cursor: null });
  });

  it("should send no token and use the Azure DevOps client when the platform is proxied ADO", async () => {
    // given
    const harness = createHarness();
    harness.ado.get.mockResolvedValue({ value: [], count: 0 });

    const authService = new StubAuthenticationService();
    const api = new CodeHealthRepositoriesApi({
      clients: harness.clients,
      authService,
      config: aCodeHealthConfig({
        platform: "azure-devops",
        organization: "acme",
        proxied: { "azure-devops": true },
      }),
    });

    // when
    const result = await api.listRepositories();

    // then
    expect(result).toEqual([]);
    expect(harness.ado.get).toHaveBeenCalledWith("", "/acme/_apis/projects?api-version=7.1");
    expect(harness.graphQL.request).not.toHaveBeenCalled();
  });

  it("should skip Sonar enrichment when no Sonar integration is configured", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request
      .mockResolvedValueOnce(singlePage([repositoryNode]))
      .mockResolvedValue({ repository: { object: null, branchProtectionRules: { nodes: [] } } });

    const api = new CodeHealthRepositoriesApi({
      clients: harness.clients,
      authService: configuredAuth(),
      config: EMPTY_CODE_HEALTH_CONFIG,
    });

    // when
    const result = await api.listRepositories();

    // then
    expect(harness.sonar.get).not.toHaveBeenCalled();
    expect(result[0].sonarMetrics).toBeNull();
  });

  it("should enrich with Sonar metrics when the integration is configured", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request
      .mockResolvedValueOnce(singlePage([repositoryNode]))
      .mockResolvedValue({ repository: { object: null, branchProtectionRules: { nodes: [] } } });
    harness.sonar.get.mockImplementation((_token: string, _baseUrl: string | null, path: string) => {
      if (path.startsWith("/api/projects/search")) {
        return Promise.resolve({ components: [{ key: "acme_my-repo" }], paging: { total: 1 } });
      }
      if (path.startsWith("/api/measures/component")) {
        return Promise.resolve({ component: { measures: [{ metric: "bugs", value: "3" }] } });
      }
      return Promise.resolve({ projectStatus: { status: "OK" } });
    });

    const authService = configuredAuth();
    authService.setSonarToken("sonar-tok");
    authService.setSonarType("cloud");

    const api = new CodeHealthRepositoriesApi({
      clients: harness.clients,
      authService,
      config: EMPTY_CODE_HEALTH_CONFIG,
    });

    // when
    const result = await api.listRepositories();

    // then
    expect(result[0].sonarMetrics?.bugs).toBe(3);
    expect(result[0].sonarMetrics?.qualityGateStatus).toBe("OK");
  });

  it("should rebuild the object graph on every call so settings changes take effect", async () => {
    // given
    const harness = createHarness();
    harness.graphQL.request.mockResolvedValue(singlePage([]));
    harness.ado.get.mockResolvedValue({ value: [], count: 0 });

    const authService = configuredAuth();
    const api = new CodeHealthRepositoriesApi({
      clients: harness.clients,
      authService,
      config: EMPTY_CODE_HEALTH_CONFIG,
    });
    await api.listRepositories();

    // when
    authService.setPlatform("azure-devops");
    await api.listRepositories();

    // then
    expect(harness.ado.get).toHaveBeenCalled();
  });
});
