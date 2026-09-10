import { createRouteRef, createSubRouteRef } from "@backstage/core-plugin-api";

/**
 * The plugin root, which renders the **Insights** tab.
 *
 * Insights leads because it is the only tab that answers a question about the
 * fleet rather than about one row of it, and that is what someone opening the
 * plugin cold is looking for. The two tables are a drill-down from it.
 */
export const rootRouteRef = createRouteRef({
  id: "code-health",
});

export const contributorsRouteRef = createSubRouteRef({
  id: "code-health:contributors",
  parent: rootRouteRef,
  path: "/contributors",
});

export const repositoriesRouteRef = createSubRouteRef({
  id: "code-health:repositories",
  parent: rootRouteRef,
  path: "/repositories",
});

/**
 * One person's detail page, nested under the Contributors tab.
 *
 * The person is named in the query string (`?key=`) rather than in the path.
 * A person key is `user:default/jane` for a linked person and
 * `vcs:jane@acme.com` for an unlinked account; both carry characters that a
 * path segment has to encode, and React Router decodes a segment before it
 * matches it, so an encoded slash splits the key into two segments and the
 * route never matches. A query value survives the round trip intact.
 */
export const contributorDetailRouteRef = createSubRouteRef({
  id: "code-health:contributor",
  parent: rootRouteRef,
  path: "/contributors/person",
});

/** One repository's detail page, nested under the Repositories tab. */
export const repositoryDetailRouteRef = createSubRouteRef({
  id: "code-health:repository",
  parent: rootRouteRef,
  path: "/repositories/:id",
});
