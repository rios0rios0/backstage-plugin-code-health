import type { HttpAuthService, SchedulerService } from "@backstage/backend-plugin-api";
import { InputError, NotFoundError } from "@backstage/errors";
import {
  CODE_HEALTH_API_VERSION,
  isIdentitySource,
  isTimeSeriesBucket,
  type IdentitySource,
  type IntegrationCapabilities,
  type TimeSeriesBucket,
} from "@rios0rios0/backstage-plugin-code-health-common";
import express from "express";
import Router from "express-promise-router";
import { z } from "zod";
import type { GetRepositoryTimeSeries } from "../../domain/commands/get_repository_time_series";
import {
  UnknownIdentityError,
  UnknownUserError,
  type LinkIdentity,
} from "../../domain/commands/link_identity";
import type { ListContributorSummaries } from "../../domain/commands/list_contributor_summaries";
import type { ListIdentities } from "../../domain/commands/list_identities";
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

const linkSchema = z.object({
  source: z.string(),
  sourceKey: z.string().min(1),
  entityRef: z.string().min(1),
});

/**
 * Reads the `source` query parameter, which narrows the Identities screen to
 * one system. An unrecognised value is rejected rather than ignored: silently
 * returning every source would look like a filter that does not work.
 */
const readSources = (value: unknown): readonly IdentitySource[] | undefined => {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  const sources = values.filter(isIdentitySource);
  if (sources.length !== values.length) {
    throw new InputError("`source` must be one of vcs, wakatime, jira or confluence");
  }
  return sources;
};

/**
 * Turns the linking command's own refusals into HTTP.
 *
 * The command throws plain domain errors so it stays testable without a web
 * framework; mapping them lives here, where the transport does.
 */
const asHttpError = (error: unknown): unknown => {
  if (error instanceof UnknownIdentityError || error instanceof UnknownUserError) {
    return new NotFoundError(error.message);
  }
  return error;
};

const readLinked = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InputError("`linked` must be true or false");
};

export interface CodeHealthRouterOptions {
  readonly store: CodeHealthStore;
  readonly httpAuth: HttpAuthService;
  readonly scheduler: SchedulerService;
  readonly repositories: ListRepositorySummaries;
  readonly contributors: ListContributorSummaries;
  readonly timeSeries: GetRepositoryTimeSeries;
  readonly identities: ListIdentities;
  readonly links: LinkIdentity;
  readonly capabilities: IntegrationCapabilities;
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

  // Asked once before anything is drawn, so a column for a switched-off
  // integration is never built rather than being built and left empty.
  router.get(`/${version}/capabilities`, (_request, response) => {
    response.json({ integrations: options.capabilities });
  });

  router.get(`/${version}/identities`, async (request, response) => {
    const sources = readSources(request.query.source);
    const linked = readLinked(request.query.linked);

    response.json({
      items: await options.identities.run({
        ...(sources === undefined ? {} : { sources }),
        ...(linked === undefined ? {} : { linked }),
      }),
    });
  });

  /**
   * Attaches an account to a catalog user.
   *
   * `PUT` rather than `POST` because it is idempotent: an account has at most
   * one link, and linking the same pair twice has to mean the same thing as
   * linking it once.
   */
  router.put(`/${version}/identities/links`, async (request, response) => {
    // A signed-in user, not a service. A manual link is a human's statement
    // that two accounts are the same person, and it outranks everything the
    // plugin infers — so who made it is recorded, and a service account cannot.
    const credentials = await options.httpAuth.credentials(request, { allow: ["user"] });

    const parsed = linkSchema.safeParse(request.body);
    if (!parsed.success) throw new InputError(parsed.error.message);
    if (!isIdentitySource(parsed.data.source)) {
      throw new InputError("`source` must be one of vcs, wakatime, jira or confluence");
    }

    try {
      await options.links.link({
        source: parsed.data.source,
        sourceKey: parsed.data.sourceKey,
        entityRef: parsed.data.entityRef,
        linkedBy: credentials.principal.userEntityRef,
        now: new Date(),
      });
    } catch (error) {
      throw asHttpError(error);
    }

    response.status(204).end();
  });

  router.delete(
    `/${version}/identities/links/:source/:sourceKey`,
    async (request, response) => {
      await options.httpAuth.credentials(request, { allow: ["user"] });

      const { source, sourceKey } = request.params;
      if (!isIdentitySource(source)) {
        throw new InputError("`source` must be one of vcs, wakatime, jira or confluence");
      }

      await options.links.unlink({ source, sourceKey });
      response.status(204).end();
    },
  );

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
