import type { AdoRestClient } from "../../src/infrastructure/http/ado_rest_client";
import type { GraphQLClient } from "../../src/infrastructure/http/graphql_client";
import type { SonarClient } from "../../src/infrastructure/http/sonar_client";
import type { WakaTimeClient } from "../../src/infrastructure/http/wakatime_client";
import type { GitforgeClients } from "../../src/main/factories/repository_factory";

export const createStubGraphQLClient = () => {
  const request = jest.fn();
  return { client: { request } as unknown as GraphQLClient, request };
};

export const createStubAdoRestClient = () => {
  const get = jest.fn();
  return { client: { get } as unknown as AdoRestClient, get };
};

export const createStubSonarClient = () => {
  const get = jest.fn();
  return { client: { get } as unknown as SonarClient, get };
};

export const createStubWakaTimeClient = () => {
  const get = jest.fn();
  return { client: { get } as unknown as WakaTimeClient, get };
};

/** All four clients at once, for anything that builds a full object graph. */
export const createStubClients = (): GitforgeClients => ({
  graphQLClient: createStubGraphQLClient().client,
  adoRestClient: createStubAdoRestClient().client,
  sonarClient: createStubSonarClient().client,
  wakaTimeClient: createStubWakaTimeClient().client,
});
