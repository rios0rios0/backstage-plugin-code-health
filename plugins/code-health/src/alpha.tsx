import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
} from "@backstage/frontend-plugin-api";
import { compatWrapper, convertLegacyRouteRef } from "@backstage/core-compat-api";
import AssessmentIcon from "@material-ui/icons/Assessment";
import {
  codeHealthConfigApiFactory,
  codeHealthContributorsApiFactory,
  codeHealthCoverageApiFactory,
  codeHealthIdentitiesApiFactory,
  codeHealthIntegrationsApiFactory,
  codeHealthRepositoriesApiFactory,
  codeHealthTimeSeriesApiFactory,
} from "./main/apis";
import { rootRouteRef } from "./routes";

/**
 * Entry point for Backstage's declarative frontend system. Apps built on
 * `@backstage/frontend-defaults` import the default export from
 * `@rios0rios0/backstage-plugin-code-health/alpha` and list it in `features`.
 *
 * The page itself is still written against the legacy APIs, so it is mounted
 * through `compatWrapper`, exactly as the community plugins do.
 */

export const codeHealthCoverageApi = ApiBlueprint.make({
  name: "coverage",
  params: (defineParams) => defineParams(codeHealthCoverageApiFactory),
});

export const codeHealthConfigApi = ApiBlueprint.make({
  name: "config",
  params: (defineParams) => defineParams(codeHealthConfigApiFactory),
});

export const codeHealthRepositoriesApi = ApiBlueprint.make({
  name: "repositories",
  params: (defineParams) => defineParams(codeHealthRepositoriesApiFactory),
});

export const codeHealthContributorsApi = ApiBlueprint.make({
  name: "contributors",
  params: (defineParams) => defineParams(codeHealthContributorsApiFactory),
});

export const codeHealthTimeSeriesApi = ApiBlueprint.make({
  name: "time-series",
  params: (defineParams) => defineParams(codeHealthTimeSeriesApiFactory),
});

export const codeHealthIntegrationsApi = ApiBlueprint.make({
  name: "integrations",
  params: (defineParams) => defineParams(codeHealthIntegrationsApiFactory),
});

export const codeHealthIdentitiesApi = ApiBlueprint.make({
  name: "identities",
  params: (defineParams) => defineParams(codeHealthIdentitiesApiFactory),
});

export const codeHealthPage = PageBlueprint.make({
  params: {
    path: "/code-health",
    // `title` and `icon` are what the app infers the sidebar nav item from;
    // `NavItemBlueprint` is deprecated in favour of passing them here.
    title: "Code Health",
    icon: <AssessmentIcon />,
    routeRef: convertLegacyRouteRef(rootRouteRef),
    loader: () => import("./main/router").then((m) => compatWrapper(<m.Router />)),
  },
});

export default createFrontendPlugin({
  pluginId: "code-health",
  extensions: [
    codeHealthConfigApi,
    codeHealthRepositoriesApi,
    codeHealthContributorsApi,
    codeHealthCoverageApi,
    codeHealthTimeSeriesApi,
    codeHealthIntegrationsApi,
    codeHealthIdentitiesApi,
    codeHealthPage,
  ],
});
