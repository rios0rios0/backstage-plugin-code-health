import { createRouteRef, createSubRouteRef } from "@backstage/core-plugin-api";

export const rootRouteRef = createRouteRef({
  id: "code-health",
});

export const contributorsRouteRef = createSubRouteRef({
  id: "code-health:contributors",
  parent: rootRouteRef,
  path: "/contributors",
});

export const settingsRouteRef = createSubRouteRef({
  id: "code-health:settings",
  parent: rootRouteRef,
  path: "/settings",
});
