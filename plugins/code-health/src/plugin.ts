import { createPlugin, createRoutableExtension } from "@backstage/core-plugin-api";
import { codeHealthApis } from "./main/apis";
import { contributorsRouteRef, insightsRouteRef, rootRouteRef } from "./routes";

export const codeHealthPlugin = createPlugin({
  id: "code-health",
  apis: codeHealthApis,
  routes: {
    root: rootRouteRef,
    contributors: contributorsRouteRef,
    insights: insightsRouteRef,
  },
});

/**
 * Full page extension. Mount it in your app at a route of your choosing:
 *
 * ```tsx
 * <Route path="/code-health" element={<CodeHealthPage />} />
 * ```
 */
export const CodeHealthPage = codeHealthPlugin.provide(
  createRoutableExtension({
    name: "CodeHealthPage",
    component: () => import("./main/router").then((m) => m.Router),
    mountPoint: rootRouteRef,
  }),
);
