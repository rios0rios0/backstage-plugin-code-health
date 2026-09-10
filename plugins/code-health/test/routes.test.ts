import {
  contributorDetailRouteRef,
  contributorsRouteRef,
  repositoriesRouteRef,
  repositoryDetailRouteRef,
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

  it("should nest the contributor detail page under the contributors tab", () => {
    // given / when
    const path = contributorDetailRouteRef.path;

    // then
    // The person is named in the query string, not the path: a person key
    // carries a colon and a slash, and React Router decodes a path segment
    // before matching it, so an encoded slash would split the key in two.
    expect(path).toBe("/contributors/person");
    expect(contributorDetailRouteRef.parent).toBe(rootRouteRef);
  });

  it("should nest the repository detail page under the repositories tab", () => {
    // given / when
    const path = repositoryDetailRouteRef.path;

    // then
    expect(path).toBe("/repositories/:id");
    expect(repositoryDetailRouteRef.parent).toBe(rootRouteRef);
  });
});
