import {
  codeHealthApis,
  codeHealthAuthApiFactory,
  codeHealthConfigApiFactory,
  codeHealthContributorsApiFactory,
  codeHealthRepositoriesApiFactory,
  createCodeHealthClients,
} from "../../src/main/apis";
import {
  codeHealthAuthApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthRepositoriesApiRef,
} from "../../src/main/api_refs";
import { HttpAdoRestClient } from "../../src/infrastructure/http/ado_rest_client";
import { HttpGraphQLClient } from "../../src/infrastructure/http/graphql_client";
import { HttpSonarClient } from "../../src/infrastructure/http/sonar_client";
import { HttpWakaTimeClient } from "../../src/infrastructure/http/wakatime_client";
import { NOT_CONFIGURED_MESSAGE } from "../../src/service/settings_resolver";
import { aCodeHealthConfig } from "../builders/code_health_config_builder";
import {
  asConfigApi,
  createStubFetchApi,
  StubConfigApi,
  StubDiscoveryApi,
} from "../doubles/stub_backstage_apis";
import { StubAsyncAuthenticationService } from "../doubles/stub_async_authentication_service";

const buildDeps = (configValues: Record<string, string | number> = {}) => ({
  configApi: asConfigApi(new StubConfigApi(configValues)),
  discoveryApi: new StubDiscoveryApi(),
  fetchApi: createStubFetchApi().fetchApi,
  authService: new StubAsyncAuthenticationService(),
  config: aCodeHealthConfig(),
});

describe("createCodeHealthClients", () => {
  it("should build one client per integration target", () => {
    // given
    const { configApi, discoveryApi, fetchApi } = buildDeps();

    // when
    const clients = createCodeHealthClients(fetchApi, discoveryApi, configApi);

    // then
    expect(clients.graphQLClient).toBeInstanceOf(HttpGraphQLClient);
    expect(clients.adoRestClient).toBeInstanceOf(HttpAdoRestClient);
    expect(clients.sonarClient).toBeInstanceOf(HttpSonarClient);
    expect(clients.wakaTimeClient).toBeInstanceOf(HttpWakaTimeClient);
  });

  it("should build clients from an app-config that pins proxy paths", () => {
    // given
    const { configApi, discoveryApi, fetchApi } = buildDeps({
      "codeHealth.github.proxyPath": "/github/api",
      "codeHealth.sonar.proxyPath": "/sonar",
    });

    // when
    const clients = createCodeHealthClients(fetchApi, discoveryApi, configApi);

    // then
    expect(clients.graphQLClient).toBeInstanceOf(HttpGraphQLClient);
    expect(clients.sonarClient).toBeInstanceOf(HttpSonarClient);
  });
});

describe("codeHealthApis", () => {
  it("should register a factory for every plugin API ref", () => {
    // given / when
    const refs = codeHealthApis.map((factory) => factory.api);

    // then
    expect(refs).toEqual([
      codeHealthAuthApiRef,
      codeHealthConfigApiRef,
      codeHealthRepositoriesApiRef,
      codeHealthContributorsApiRef,
    ]);
  });

  it("should build an authentication service that starts out not ready", () => {
    // given / when
    const authService = codeHealthAuthApiFactory.factory({});

    // then
    expect(authService.isReady()).toBe(false);
    expect(typeof authService.whenReady).toBe("function");
  });

  it("should read the plugin config from app-config", () => {
    // given
    const configApi = asConfigApi(
      new StubConfigApi({
        "codeHealth.platform": "azure-devops",
        "codeHealth.organization": "acme",
      }),
    );

    // when
    const config = codeHealthConfigApiFactory.factory({ configApi });

    // then
    expect(config.platform).toBe("azure-devops");
    expect(config.organization).toBe("acme");
  });

  it("should build a dashboard service that refuses to run without credentials", async () => {
    // given
    const deps = buildDeps();

    // when
    const service = codeHealthRepositoriesApiFactory.factory(deps);

    // then
    await expect(service.listRepositories()).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
  });

  it("should build a contributor service that refuses to run without credentials", async () => {
    // given
    const deps = buildDeps();

    // when
    const service = codeHealthContributorsApiFactory.factory(deps);

    // then
    await expect(service.listContributors(null, null)).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
  });
});
