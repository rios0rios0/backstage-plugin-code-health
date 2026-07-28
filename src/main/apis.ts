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
import { readEndpointConfig, readCodeHealthConfig } from "../infrastructure/services/backstage_config_service";
import {
  codeHealthAuthApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthRepositoriesApiRef,
} from "./api_refs";
import type { CodeHealthClients } from "./factories/repository_factory";
import { createAuthenticationService } from "./factories/service_factory";
import { CodeHealthContributorsApi } from "./code_health_contributors_api";
import { CodeHealthRepositoriesApi } from "./code_health_repositories_api";

export const createCodeHealthClients = (
  fetchApi: FetchApi,
  discoveryApi: DiscoveryApi,
  configApi: ConfigApi,
): CodeHealthClients => {
  const resolver = new BackstageEndpointResolver(discoveryApi, readEndpointConfig(configApi));

  return {
    graphQLClient: new HttpGraphQLClient(fetchApi, resolver),
    adoRestClient: new HttpAdoRestClient(fetchApi, resolver),
    sonarClient: new HttpSonarClient(fetchApi, resolver),
    wakaTimeClient: new HttpWakaTimeClient(fetchApi, resolver),
  };
};

/**
 * The API factories are exported individually as well as in {@link codeHealthApis},
 * so the `/alpha` entry point can register each one as its own extension without
 * duplicating the wiring.
 */
export const codeHealthAuthApiFactory = createApiFactory({
  api: codeHealthAuthApiRef,
  deps: {},
  factory: () => createAuthenticationService(),
});

export const codeHealthConfigApiFactory = createApiFactory({
  api: codeHealthConfigApiRef,
  deps: { configApi: configApiRef },
  factory: ({ configApi }) => readCodeHealthConfig(configApi),
});

export const codeHealthRepositoriesApiFactory = createApiFactory({
  api: codeHealthRepositoriesApiRef,
  deps: {
    configApi: configApiRef,
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
    authService: codeHealthAuthApiRef,
    config: codeHealthConfigApiRef,
  },
  factory: ({ configApi, discoveryApi, fetchApi, authService, config }) =>
    new CodeHealthRepositoriesApi({
      clients: createCodeHealthClients(fetchApi, discoveryApi, configApi),
      authService,
      config,
    }),
});

export const codeHealthContributorsApiFactory = createApiFactory({
  api: codeHealthContributorsApiRef,
  deps: {
    configApi: configApiRef,
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
    authService: codeHealthAuthApiRef,
    config: codeHealthConfigApiRef,
  },
  factory: ({ configApi, discoveryApi, fetchApi, authService, config }) =>
    new CodeHealthContributorsApi({
      clients: createCodeHealthClients(fetchApi, discoveryApi, configApi),
      authService,
      config,
    }),
});

export const codeHealthApis: AnyApiFactory[] = [
  codeHealthAuthApiFactory,
  codeHealthConfigApiFactory,
  codeHealthRepositoriesApiFactory,
  codeHealthContributorsApiFactory,
];
