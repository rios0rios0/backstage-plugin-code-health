import { createBackend } from "@backstage/backend-defaults";
import { mockServices } from "@backstage/backend-test-utils";
import { catalogServiceMock } from "@backstage/plugin-catalog-node/testUtils";

/**
 * Local development harness. Start it with `yarn start` in this package, then:
 *
 *   curl http://localhost:7007/api/code-health/health
 *   curl http://localhost:7007/api/code-health/v1/coverage \
 *     -H 'Authorization: Bearer mock-service-token'
 *
 * Force a discovery pass without waiting for the schedule:
 *
 *   curl -X POST http://localhost:7007/api/code-health/.backstage/scheduler/v1/tasks/code-health.discover/trigger
 */
const backend = createBackend();

// Auth is mocked so the routes can be called without signing in; the catalog is
// mocked so there is a repository to discover without running a real one.
backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

backend.add(
  catalogServiceMock.factory({
    entities: [
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: {
          name: "sample-github",
          title: "Sample GitHub Component",
          annotations: {
            "github.com/project-slug": "rios0rios0/backstage-plugin-code-health",
          },
        },
        spec: { type: "library", owner: "rios0rios0" },
      },
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: {
          name: "sample-azure",
          title: "Sample Azure DevOps Component",
          annotations: {
            "dev.azure.com/host-org": "dev.azure.com/example-org",
            "dev.azure.com/project-repo": "example-project/example-repo",
          },
        },
        spec: { type: "service", owner: "rios0rios0" },
      },
    ],
  }),
);

backend.add(import("../src"));

backend.start();
