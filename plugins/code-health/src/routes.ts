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
