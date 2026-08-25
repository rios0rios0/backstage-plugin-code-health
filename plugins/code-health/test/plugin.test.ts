import { codeHealthApis } from "../src/main/apis";
import { CodeHealthPage, codeHealthPlugin } from "../src/plugin";
import {
  contributorsRouteRef,
  repositoriesRouteRef,
  rootRouteRef,
} from "../src/routes";

describe("codeHealthPlugin", () => {
  it("should be registered under the plugin id the package declares", () => {
    // given / when
    const id = codeHealthPlugin.getId();

    // then
    // The backend plugin claims the same id, which is what makes
    // `discoveryApi.getBaseUrl` resolve to it.
    expect(id).toBe("code-health");
  });

  it("should register every utility API the plugin exposes", () => {
    // given / when
    const apis = [...codeHealthPlugin.getApis()];

    // then
    // The credential API is gone: there is nothing left for a browser to hold
    // now that the backend authenticates through `integrations`.
    expect(apis).toHaveLength(codeHealthApis.length);
    expect(apis.map((api) => api.api.id).sort()).toEqual([
      "plugin.code-health.config",
      "plugin.code-health.contributors",
      "plugin.code-health.coverage",
      "plugin.code-health.repositories",
      "plugin.code-health.time-series",
    ]);
  });

  it("should publish the root route and both sub routes", () => {
    // given / when
    const routes = codeHealthPlugin.routes;

    // then
    // The root renders Insights now, so the sub routes are the two tables. An
    // app deep-linking to the old `/insights` path has to move to the root.
    expect(routes.root).toBe(rootRouteRef);
    expect(routes.contributors).toBe(contributorsRouteRef);
    expect(routes.repositories).toBe(repositoriesRouteRef);
  });

  it("should provide the page as a renderable routable extension", () => {
    // given / when / then
    expect(typeof CodeHealthPage).toBe("function");
  });
});
