import {
  contributorsRouteRef,
  repositoriesRouteRef,
  rootRouteRef,
} from "../src/routes";

describe("routes", () => {
  it("should expose a root route ref identified as the plugin", () => {
    // given / when
    const description = String(rootRouteRef);

    // then
    expect(description).toContain("code-health");
  });

  it("should mount the contributors sub route under the root route", () => {
    // given / when
    const path = contributorsRouteRef.path;

    // then
    expect(path).toBe("/contributors");
    expect(contributorsRouteRef.parent).toBe(rootRouteRef);
  });

  it("should mount the repositories sub route under the root route", () => {
    // given / when
    const path = repositoriesRouteRef.path;

    // then
    // Repositories moved off the root when Insights became the landing tab, so
    // it needs a sub route of its own to stay deep-linkable.
    expect(path).toBe("/repositories");
    expect(repositoriesRouteRef.parent).toBe(rootRouteRef);
  });
});
