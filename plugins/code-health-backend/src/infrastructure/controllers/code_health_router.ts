import type { HttpAuthService } from "@backstage/backend-plugin-api";
import { CODE_HEALTH_API_VERSION } from "@rios0rios0/backstage-plugin-code-health-common";
import express from "express";
import Router from "express-promise-router";
import type { CodeHealthStore } from "../../domain/repositories/code_health_store";

export interface CodeHealthRouterOptions {
  readonly store: CodeHealthStore;
  readonly httpAuth: HttpAuthService;
}

/**
 * The read side of the plugin, mounted at `/api/code-health`.
 *
 * Every route serves from the database. The browser never reaches a version
 * control provider, so the cost of a dashboard load is independent of how many
 * repositories exist and how many people are looking at it.
 */
export const createCodeHealthRouter = (options: CodeHealthRouterOptions): express.Router => {
  const router = Router();
  router.use(express.json());

  router.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.get(`/${CODE_HEALTH_API_VERSION}/coverage`, async (_request, response) => {
    const counts = await options.store.getCoverage();

    const percent =
      counts.expectedDays === 0
        ? 0
        : Math.round((counts.ingestedDays / counts.expectedDays) * 1000) / 10;

    response.json({
      earliestDay: counts.earliestDay,
      latestDay: counts.latestDay,
      lastIngestedAt: counts.lastIngestedAt?.toISOString() ?? null,
      freshUntil: counts.freshUntil?.toISOString() ?? null,
      backfill: {
        repositories: counts.repositories,
        complete: counts.complete,
        pendingDays: Math.max(0, counts.expectedDays - counts.ingestedDays),
        ingestedDays: counts.ingestedDays,
        percent,
        failing: counts.failing,
      },
    });
  });

  return router;
};
