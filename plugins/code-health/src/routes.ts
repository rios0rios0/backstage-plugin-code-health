import { createRouteRef, createSubRouteRef } from "@backstage/core-plugin-api";

export const rootRouteRef = createRouteRef({
  id: "code-health",
});

export const contributorsRouteRef = createSubRouteRef({
  id: "code-health:contributors",
  parent: rootRouteRef,
  path: "/contributors",
});
