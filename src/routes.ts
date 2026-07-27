import { createRouteRef, createSubRouteRef } from "@backstage/core-plugin-api";

export const rootRouteRef = createRouteRef({
  id: "gitforge-dashboard",
});

export const contributorsRouteRef = createSubRouteRef({
  id: "gitforge-dashboard:contributors",
  parent: rootRouteRef,
  path: "/contributors",
});

export const settingsRouteRef = createSubRouteRef({
  id: "gitforge-dashboard:settings",
  parent: rootRouteRef,
  path: "/settings",
});
