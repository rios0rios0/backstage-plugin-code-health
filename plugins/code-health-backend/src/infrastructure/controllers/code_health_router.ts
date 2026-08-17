import type { HttpAuthService, SchedulerService } from "@backstage/backend-plugin-api";
import { InputError, NotFoundError } from "@backstage/errors";
import {
  CODE_HEALTH_API_VERSION,
  isTimeSeriesBucket,
  type TimeSeriesBucket,
} from "@rios0rios0/backstage-plugin-code-health-common";
import express from "express";
import Router from "express-promise-router";
import { z } from "zod";
import type { GetRepositoryTimeSeries } from "../../domain/commands/get_repository_time_series";
import type { ListContributorSummaries } from "../../domain/commands/list_contributor_summaries";
import type { ListRepositorySummaries } from "../../domain/commands/list_repository_summaries";
import type { CodeHealthStore } from "../../domain/repositories/code_health_store";

/** Asked for nothing in particular, the dashboard gets the last day. */
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A year of daily buckets is already more than any chart renders usefully. */
const MAX_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

const windowSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const parseInstant = (value: string, field: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InputError(`\`${field}\` is not a valid ISO 8601 instant`);
  }
  return parsed;
};

/**
 * Reads the requested window, defaulting to the last day.
 *
 * The window is bounded rather than trusted: an unbounded `from` would make one
 * request scan the entire event table, which is a denial of service any
 * authenticated user could trigger by editing a URL.
 */
const readWindow = (query: unknown): { from: Date; to: Date } => {
  const parsed = windowSchema.safeParse(query);
  if (!parsed.success) throw new InputError(parsed.error.message);

  const to = parsed.data.to ? parseInstant(parsed.data.to, "to") : new Date();
  const from = parsed.data.from
    ? parseInstant(parsed.data.from, "from")
    : new Date(to.getTime() - DEFAULT_WINDOW_MS);

  if (from >= to) throw new InputError("`from` must be earlier than `to`");
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    throw new InputError("the requested window is longer than the retention period");
  }

  return { from, to };
};

const readBucket = (value: unknown): TimeSeriesBucket => {
  if (value === undefined) return "day";
  if (typeof value !== "string" || !isTimeSeriesBucket(value)) {
    throw new InputError("`bucket` must be one of day, week or month");
  }
  return value;
};

export interface CodeHealthRouterOptions {
  readonly store: CodeHealthStore;
  readonly httpAuth: HttpAuthService;
  readonly scheduler: SchedulerService;
  readonly repositories: ListRepositorySummaries;
  readonly contributors: ListContributorSummaries;
  readonly timeSeries: GetRepositoryTimeSeries;
  readonly refreshableTaskIds: readonly string[];
}

/**
 * The read side of the plugin, mounted at `/api/code-health`.
 *
 * Every route serves from the database. The browser never reaches a version
 * control provider, so a dashboard load costs the same whether ten people or a
 * thousand are looking at it, and whether the catalog holds ten repositories or
 * a thousand.
 */
export const createCodeHealthRouter = (options: CodeHealthRouterOptions): express.Router => {
  const router = Router();
  const version = CODE_HEALTH_API_VERSION;
  router.use(express.json());

  router.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.get(`/${version}/coverage`, async (_request, response) => {
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

  router.get(`/${version}/repositories`, async (request, response) => {
    const window = readWindow(request.query);
    response.json({
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      items: await options.repositories.run(window),
    });
  });

  // Fleet-wide cadence. Registered before the per-repository route so the
  // literal path is not swallowed by `:id`.
  router.get(`/${version}/timeseries`, async (request, response) => {
    const window = readWindow(request.query);
    const bucket = readBucket(request.query.bucket);

    response.json({
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      bucket,
      points: await options.timeSeries.run({ ...window, bucket }),
    });
  });

  router.get(`/${version}/repositories/:id/timeseries`, async (request, response) => {
    const window = readWindow(request.query);
    const bucket = readBucket(request.query.bucket);

    const tracked = await options.store.getTrackedRepository(request.params.id);
    if (!tracked) throw new NotFoundError(`no repository with id ${request.params.id}`);

    response.json({
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      bucket,
      points: await options.timeSeries.run({
        repositoryId: request.params.id,
        ...window,
        bucket,
      }),
    });
  });

  router.get(`/${version}/contributors`, async (request, response) => {
    const window = readWindow(request.query);
    const repositoryId = request.query.repositoryId;
    if (repositoryId !== undefined && typeof repositoryId !== "string") {
      throw new InputError("`repositoryId` must be a single value");
    }

    response.json({
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      items: await options.contributors.run({
        ...window,
        ...(repositoryId === undefined ? {} : { repositoryId }),
      }),
    });
  });

  router.post(`/${version}/refresh`, async (request, response) => {
    // A signed-in user, not a service: this exists so someone looking at stale
    // numbers can ask for a run, and attributing that to a person is the point.
    await options.httpAuth.credentials(request, { allow: ["user"] });

    const triggered: string[] = [];
    for (const id of options.refreshableTaskIds) {
      try {
        await options.scheduler.triggerTask(id);
        triggered.push(id);
      } catch {
        // `triggerTask` throws when the task is already running, which is a
        // perfectly good answer to "refresh now" and not worth surfacing as a
        // failure.
      }
    }

    response.json({ triggered });
  });

  return router;
};
