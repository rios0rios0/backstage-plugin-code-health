import { createPlugin, createRoutableExtension } from "@backstage/core-plugin-api";
import { gitforgeApis } from "./main/apis";
import { contributorsRouteRef, rootRouteRef, settingsRouteRef } from "./routes";

export const gitforgeDashboardPlugin = createPlugin({
  id: "gitforge-dashboard",
  apis: gitforgeApis,
  routes: {
    root: rootRouteRef,
    contributors: contributorsRouteRef,
    settings: settingsRouteRef,
  },
});

/**
 * Full page extension. Mount it in your app at a route of your choosing:
 *
 * ```tsx
 * <Route path="/gitforge" element={<GitforgeDashboardPage />} />
 * ```
 */
export const GitforgeDashboardPage = gitforgeDashboardPlugin.provide(
  createRoutableExtension({
    name: "GitforgeDashboardPage",
    component: () => import("./main/router").then((m) => m.Router),
    mountPoint: rootRouteRef,
  }),
);
