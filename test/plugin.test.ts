import { CodeHealthPage, codeHealthPlugin } from "../src/plugin";
import { codeHealthApis } from "../src/main/apis";
import {
  contributorsRouteRef,
  rootRouteRef,
  settingsRouteRef,
} from "../src/routes";

describe("codeHealthPlugin", () => {
  it("should be registered under the plugin id the package declares", () => {
    // given / when
    const id = codeHealthPlugin.getId();

    // then
    expect(id).toBe("code-health");
  });

  it("should register every utility API the plugin exposes", () => {
    // given / when
    const apis = [...codeHealthPlugin.getApis()];

    // then
    expect(apis).toHaveLength(codeHealthApis.length);
    expect(apis.map((api) => api.api.id).sort()).toEqual([
      "plugin.code-health.auth",
      "plugin.code-health.config",
      "plugin.code-health.contributors",
      "plugin.code-health.repositories",
    ]);
  });

  it("should publish the root route and both sub routes", () => {
    // given / when
    const routes = codeHealthPlugin.routes;

    // then
    expect(routes.root).toBe(rootRouteRef);
    expect(routes.contributors).toBe(contributorsRouteRef);
    expect(routes.settings).toBe(settingsRouteRef);
  });

  it("should provide the page as a renderable routable extension", () => {
    // given / when / then
    expect(typeof CodeHealthPage).toBe("function");
  });
});
