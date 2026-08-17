import type { AnyApiFactory } from "@backstage/core-plugin-api";
import {
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from "@backstage/core-plugin-api";
import { CodeHealthBackendClient } from "../infrastructure/http/code_health_backend_client";
import { readCodeHealthConfig } from "../infrastructure/services/backstage_config_service";
import {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
} from "./api_refs";

const clientDeps = { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef };

/**
 * The API factories are exported individually as well as in {@link codeHealthApis},
 * so the `/alpha` entry point can register each one as its own extension without
 * duplicating the wiring.
 *
 * Every data API is the same stateless client, registered once per ref.
 * Splitting the refs keeps the views' dependencies honest — the contributors tab
 * does not depend on the repositories API — without any shared state to manage.
 */
export const codeHealthConfigApiFactory = createApiFactory({
  api: codeHealthConfigApiRef,
  deps: { configApi: configApiRef },
  factory: ({ configApi }) => readCodeHealthConfig(configApi),
});

export const codeHealthRepositoriesApiFactory = createApiFactory({
  api: codeHealthRepositoriesApiRef,
  deps: clientDeps,
  factory: (deps) => new CodeHealthBackendClient(deps),
});

export const codeHealthContributorsApiFactory = createApiFactory({
  api: codeHealthContributorsApiRef,
  deps: clientDeps,
  factory: (deps) => new CodeHealthBackendClient(deps),
});

export const codeHealthCoverageApiFactory = createApiFactory({
  api: codeHealthCoverageApiRef,
  deps: clientDeps,
  factory: (deps) => new CodeHealthBackendClient(deps),
});

export const codeHealthTimeSeriesApiFactory = createApiFactory({
  api: codeHealthTimeSeriesApiRef,
  deps: clientDeps,
  factory: (deps) => new CodeHealthBackendClient(deps),
});

export const codeHealthApis: AnyApiFactory[] = [
  codeHealthConfigApiFactory,
  codeHealthRepositoriesApiFactory,
  codeHealthContributorsApiFactory,
  codeHealthCoverageApiFactory,
  codeHealthTimeSeriesApiFactory,
];
