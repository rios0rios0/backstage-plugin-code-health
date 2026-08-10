import * as publicApi from "../src/index";
import * as apiRefs from "../src/main/api_refs";
import * as plugin from "../src/plugin";
import * as routes from "../src/routes";

/**
 * The barrel is the package's published surface: anything dropped from it is a
 * breaking change for consumers, so the export list is asserted explicitly
 * rather than inferred.
 */
describe("public API", () => {
  it("should re-export the same plugin instance the plugin module defines", () => {
    // given / when
    const { codeHealthPlugin, CodeHealthPage } = publicApi;

    // then
    expect(codeHealthPlugin.getId()).toBe("code-health");
    expect(CodeHealthPage).toBe(plugin.CodeHealthPage);
  });

  it("should re-export the same route refs the routes module defines", () => {
    // given / when
    const { contributorsRouteRef, rootRouteRef } = publicApi;

    // then
    expect(rootRouteRef).toBe(routes.rootRouteRef);
    expect(contributorsRouteRef).toBe(routes.contributorsRouteRef);
  });

  it("should re-export every API ref so consumers can override an implementation", () => {
    // given / when
    const {
      codeHealthCoverageApiRef,
      codeHealthConfigApiRef,
      codeHealthContributorsApiRef,
      codeHealthRepositoriesApiRef,
    } = publicApi;

    // then
    expect(codeHealthCoverageApiRef).toBe(apiRefs.codeHealthCoverageApiRef);
    expect(codeHealthConfigApiRef).toBe(apiRefs.codeHealthConfigApiRef);
    expect(codeHealthContributorsApiRef).toBe(apiRefs.codeHealthContributorsApiRef);
    expect(codeHealthRepositoriesApiRef).toBe(apiRefs.codeHealthRepositoriesApiRef);
  });

  it("should not leak anything beyond the documented runtime surface", () => {
    // given
    const expected = [
      "CodeHealthPage",
      "codeHealthConfigApiRef",
      "codeHealthContributorsApiRef",
      "codeHealthCoverageApiRef",
      "codeHealthPlugin",
      "codeHealthRepositoriesApiRef",
      "contributorsRouteRef",
      "rootRouteRef",
    ];

    // when
    const names = Object.keys(publicApi).sort();

    // then
    expect(names).toEqual(expected);
  });
});
