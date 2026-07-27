import type { AnyApiFactory, ConfigApi, DiscoveryApi, FetchApi } from "@backstage/core-plugin-api";
import {
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from "@backstage/core-plugin-api";
import { HttpAdoRestClient } from "../infrastructure/http/ado_rest_client";
import { BackstageEndpointResolver } from "../infrastructure/http/endpoint_resolver";
import { HttpGraphQLClient } from "../infrastructure/http/graphql_client";
import { HttpSonarClient } from "../infrastructure/http/sonar_client";
import { HttpWakaTimeClient } from "../infrastructure/http/wakatime_client";
import { readEndpointConfig, readGitforgeConfig } from "../infrastructure/services/backstage_config_service";
import {
  gitforgeAuthApiRef,
  gitforgeConfigApiRef,
  gitforgeContributorsApiRef,
  gitforgeDashboardApiRef,
} from "./api_refs";
import type { GitforgeClients } from "./factories/repository_factory";
import { createAuthenticationService } from "./factories/service_factory";
import { GitforgeContributorsApi } from "./gitforge_contributors_api";
import { GitforgeDashboardApi } from "./gitforge_dashboard_api";

export const createGitforgeClients = (
  fetchApi: FetchApi,
  discoveryApi: DiscoveryApi,
  configApi: ConfigApi,
): GitforgeClients => {
  const resolver = new BackstageEndpointResolver(discoveryApi, readEndpointConfig(configApi));

  return {
    graphQLClient: new HttpGraphQLClient(fetchApi, resolver),
    adoRestClient: new HttpAdoRestClient(fetchApi, resolver),
    sonarClient: new HttpSonarClient(fetchApi, resolver),
    wakaTimeClient: new HttpWakaTimeClient(fetchApi, resolver),
  };
};

export const gitforgeApis: AnyApiFactory[] = [
  createApiFactory({
    api: gitforgeAuthApiRef,
    deps: {},
    factory: () => createAuthenticationService(),
  }),
  createApiFactory({
    api: gitforgeConfigApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => readGitforgeConfig(configApi),
  }),
  createApiFactory({
    api: gitforgeDashboardApiRef,
    deps: {
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      fetchApi: fetchApiRef,
      authService: gitforgeAuthApiRef,
      config: gitforgeConfigApiRef,
    },
    factory: ({ configApi, discoveryApi, fetchApi, authService, config }) =>
      new GitforgeDashboardApi({
        clients: createGitforgeClients(fetchApi, discoveryApi, configApi),
        authService,
        config,
      }),
  }),
  createApiFactory({
    api: gitforgeContributorsApiRef,
    deps: {
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      fetchApi: fetchApiRef,
      authService: gitforgeAuthApiRef,
      config: gitforgeConfigApiRef,
    },
    factory: ({ configApi, discoveryApi, fetchApi, authService, config }) =>
      new GitforgeContributorsApi({
        clients: createGitforgeClients(fetchApi, discoveryApi, configApi),
        authService,
        config,
      }),
  }),
];
