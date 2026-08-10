import { resolvePackagePath, type DatabaseService } from "@backstage/backend-plugin-api";
import type {
  EventKind,
  Platform,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { Knex } from "knex";
import type { CodeHealthEvent, EventOutcome } from "../../domain/entities/code_health_event";
import { eventId } from "../../domain/entities/code_health_event";
import { addDays, daysBetween, fromStoredDate, toDay, type Day } from "../../domain/entities/day";
import type { IngestionState } from "../../domain/entities/ingestion_state";
import type {
  RepositorySnapshot,
  RepositorySnapshotPayload,
} from "../../domain/entities/repository_snapshot";
import type {
  DiscoveredRepository,
  TrackedRepository,
} from "../../domain/entities/tracked_repository";
import type {
  CodeHealthStore,
  CoverageCounts,
  RecordChunkRequest,
  TrackedRepositoryWithState,
} from "../../domain/repositories/code_health_store";

const MIGRATIONS_DIR = resolvePackagePath(
  "@rios0rios0/backstage-plugin-code-health-backend",
  "migrations",
);

const REPOSITORIES = "code_health_repositories";
const INGESTION_STATE = "code_health_ingestion_state";
const EVENTS = "code_health_events";
const CHUNKS = "code_health_ingested_chunks";
const SNAPSHOTS = "code_health_snapshots";
const CONTRIBUTOR_METRICS = "code_health_contributor_metrics";

/** Rows are inserted in batches so a large window does not build one huge statement. */
const INSERT_BATCH_SIZE = 200;

interface RepositoryRow {
  id: string;
  entity_ref: string;
  provider: string;
  host: string;
  owner: string;
  project: string | null;
  name: string;
  repo_url: string;
  default_branch: string | null;
  external_id: string | null;
  sonar_project_key: string | null;
  archived: boolean | number;
  discovered_at: Date | string;
  last_seen_at: Date | string;
  removed_at: Date | string | null;
}

interface IngestionStateRow {
  repository_id: string;
  backfill_floor: Date | string;
  backfill_cursor: Date | string;
  incremental_through: Date | string;
  status: string;
  failure_count: number;
  last_error: string | null;
  last_attempt_at: Date | string | null;
}

interface EventRow {
  repository_id: string;
  kind: string;
  external_id: string;
  occurred_at: Date | string;
  actor_key: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  outcome: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  payload: string | null;
}

interface SnapshotRow {
  repository_id: string;
  day: Date | string;
  captured_at: Date | string;
  payload: string;
}

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

const toNullableDate = (value: Date | string | null): Date | null =>
  value === null ? null : toDate(value);

const parsePayload = (value: string | null): Record<string, unknown> | null => {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const toRepository = (row: RepositoryRow): TrackedRepository => ({
  id: row.id,
  entityRef: row.entity_ref,
  platform: row.provider as Platform,
  host: row.host,
  owner: row.owner,
  project: row.project,
  name: row.name,
  repoUrl: row.repo_url,
  defaultBranch: row.default_branch,
  externalId: row.external_id,
  sonarProjectKey: row.sonar_project_key,
  archived: Boolean(row.archived),
  discoveredAt: toDate(row.discovered_at),
  lastSeenAt: toDate(row.last_seen_at),
  removedAt: toNullableDate(row.removed_at),
});

const toIngestionState = (row: IngestionStateRow): IngestionState => ({
  repositoryId: row.repository_id,
  backfillFloor: fromStoredDate(row.backfill_floor),
  backfillCursor: fromStoredDate(row.backfill_cursor),
  incrementalThrough: toDate(row.incremental_through),
  status: row.status as IngestionState["status"],
  failureCount: row.failure_count,
  lastError: row.last_error,
  lastAttemptAt: toNullableDate(row.last_attempt_at),
});

const toEvent = (row: EventRow): CodeHealthEvent => ({
  repositoryId: row.repository_id,
  kind: row.kind as EventKind,
  externalId: row.external_id,
  occurredAt: toDate(row.occurred_at),
  actorKey: row.actor_key,
  actorName: row.actor_name,
  actorAvatarUrl: row.actor_avatar_url,
  outcome: row.outcome as EventOutcome | null,
  additions: row.additions,
  deletions: row.deletions,
  changedFiles: row.changed_files,
  payload: parsePayload(row.payload),
});

const toEventRow = (event: CodeHealthEvent) => ({
  id: eventId(event),
  repository_id: event.repositoryId,
  kind: event.kind,
  external_id: event.externalId,
  occurred_at: event.occurredAt,
  actor_key: event.actorKey,
  actor_name: event.actorName,
  actor_avatar_url: event.actorAvatarUrl,
  outcome: event.outcome,
  additions: event.additions,
  deletions: event.deletions,
  changed_files: event.changedFiles,
  payload: event.payload === null ? null : JSON.stringify(event.payload),
});

/** Adds whole days to an instant, preserving the time of day. */
const addDaysToDate = (instant: Date, days: number): Date =>
  new Date(instant.getTime() + days * 24 * 60 * 60 * 1000);

export class KnexCodeHealthStore implements CodeHealthStore {
  private constructor(private readonly client: Knex) {}

  static async create(options: {
    database: DatabaseService;
    skipMigrations?: boolean;
  }): Promise<KnexCodeHealthStore> {
    const client = await options.database.getClient();

    if (!options.database.migrations?.skip && !options.skipMigrations) {
      await client.migrate.latest({ directory: MIGRATIONS_DIR });
    }

    return new KnexCodeHealthStore(client);
  }

  async syncRepositories(options: {
    discovered: readonly DiscoveredRepository[];
    retentionDays: number;
    now: Date;
  }): Promise<{ inserted: string[]; updated: string[]; removed: string[] }> {
    const { discovered, retentionDays, now } = options;
    const today = toDay(now);
    const floor = addDays(today, -retentionDays);
    const discoveredIds = new Set(discovered.map((repository) => repository.id));

    return this.client.transaction(async (trx) => {
      const existing = await trx<RepositoryRow>(REPOSITORIES).select("id", "removed_at");
      const existingIds = new Set(existing.map((row) => row.id));

      const inserted: string[] = [];
      const updated: string[] = [];

      for (const repository of discovered) {
        const row = {
          id: repository.id,
          entity_ref: repository.entityRef,
          provider: repository.platform,
          host: repository.host,
          owner: repository.owner,
          project: repository.project,
          name: repository.name,
          repo_url: repository.repoUrl,
          default_branch: repository.defaultBranch,
          external_id: repository.externalId,
          sonar_project_key: repository.sonarProjectKey,
          archived: repository.archived,
          last_seen_at: now,
          removed_at: null,
        };

        if (existingIds.has(repository.id)) {
          // `default_branch` and `external_id` are learnt from the provider
          // during ingestion, not from the catalog, so a rediscovery must not
          // overwrite them with the nulls it always carries.
          const { default_branch, external_id, ...refreshable } = row;
          await trx(REPOSITORIES).where({ id: repository.id }).update(refreshable);
          updated.push(repository.id);
        } else {
          await trx(REPOSITORIES).insert({ ...row, discovered_at: now });
          await trx(INGESTION_STATE).insert({
            repository_id: repository.id,
            backfill_floor: floor,
            backfill_cursor: today,
            // Start one day back so the very first run has a window to fetch
            // and the dashboard can answer for "the last day" immediately.
            incremental_through: addDaysToDate(now, -1),
            status: "pending",
            failure_count: 0,
            last_error: null,
            last_attempt_at: null,
          });
          inserted.push(repository.id);
        }
      }

      const removed = existing
        .filter((row) => !discoveredIds.has(row.id) && row.removed_at === null)
        .map((row) => row.id);

      if (removed.length > 0) {
        await trx(REPOSITORIES).whereIn("id", removed).update({ removed_at: now });
      }

      return { inserted, updated, removed };
    });
  }

  async updateRepositoryFacts(options: {
    repositoryId: string;
    defaultBranch?: string | null;
    externalId?: string | null;
    archived?: boolean;
  }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (options.defaultBranch !== undefined) update.default_branch = options.defaultBranch;
    if (options.externalId !== undefined) update.external_id = options.externalId;
    if (options.archived !== undefined) update.archived = options.archived;
    if (Object.keys(update).length === 0) return;

    await this.client(REPOSITORIES).where({ id: options.repositoryId }).update(update);
  }

  async listTrackedRepositories(): Promise<TrackedRepositoryWithState[]> {
    const rows = await this.client<RepositoryRow>(REPOSITORIES)
      .innerJoin<IngestionStateRow>(
        INGESTION_STATE,
        `${INGESTION_STATE}.repository_id`,
        `${REPOSITORIES}.id`,
      )
      .whereNull(`${REPOSITORIES}.removed_at`)
      .select(`${REPOSITORIES}.*`, `${INGESTION_STATE}.*`);

    return rows.map((row) => ({
      repository: toRepository(row as unknown as RepositoryRow),
      state: toIngestionState(row as unknown as IngestionStateRow),
    }));
  }

  async getTrackedRepository(id: string): Promise<TrackedRepositoryWithState | undefined> {
    const row = await this.client<RepositoryRow>(REPOSITORIES)
      .innerJoin<IngestionStateRow>(
        INGESTION_STATE,
        `${INGESTION_STATE}.repository_id`,
        `${REPOSITORIES}.id`,
      )
      .where(`${REPOSITORIES}.id`, id)
      .select(`${REPOSITORIES}.*`, `${INGESTION_STATE}.*`)
      .first();

    if (!row) return undefined;

    return {
      repository: toRepository(row as unknown as RepositoryRow),
      state: toIngestionState(row as unknown as IngestionStateRow),
    };
  }

  async commitIngestion(options: {
    repositoryId: string;
    events: readonly CodeHealthEvent[];
    chunk: RecordChunkRequest;
    incrementalThrough?: Date;
    backfillCursor?: Day;
    status: IngestionState["status"];
    now: Date;
  }): Promise<void> {
    const { repositoryId, events, chunk, incrementalThrough, backfillCursor, status, now } =
      options;

    await this.client.transaction(async (trx) => {
      for (let index = 0; index < events.length; index += INSERT_BATCH_SIZE) {
        const batch = events.slice(index, index + INSERT_BATCH_SIZE).map(toEventRow);
        await trx(EVENTS).insert(batch).onConflict("id").merge();
      }

      const chunkRows = chunk.kinds.flatMap((kind) =>
        chunk.days.map((day) => ({
          repository_id: chunk.repositoryId,
          kind,
          day,
          ingested_at: chunk.ingestedAt,
        })),
      );

      for (let index = 0; index < chunkRows.length; index += INSERT_BATCH_SIZE) {
        const batch = chunkRows.slice(index, index + INSERT_BATCH_SIZE);
        await trx(CHUNKS)
          .insert(batch)
          .onConflict(["repository_id", "kind", "day"])
          .merge(["ingested_at"]);
      }

      const update: Record<string, unknown> = {
        status,
        failure_count: 0,
        last_error: null,
        last_attempt_at: now,
      };
      if (incrementalThrough !== undefined) update.incremental_through = incrementalThrough;
      if (backfillCursor !== undefined) update.backfill_cursor = backfillCursor;

      await trx(INGESTION_STATE).where({ repository_id: repositoryId }).update(update);
    });
  }

  async recordIngestionFailure(options: {
    repositoryId: string;
    error: string;
    now: Date;
  }): Promise<void> {
    await this.client(INGESTION_STATE)
      .where({ repository_id: options.repositoryId })
      .update({
        status: "error",
        last_error: options.error.slice(0, 2000),
        last_attempt_at: options.now,
        failure_count: this.client.raw("failure_count + 1"),
      });
  }

  async saveSnapshot(snapshot: RepositorySnapshot): Promise<void> {
    await this.client(SNAPSHOTS)
      .insert({
        repository_id: snapshot.repositoryId,
        day: snapshot.day,
        captured_at: snapshot.capturedAt,
        payload: JSON.stringify(snapshot.payload),
      })
      .onConflict(["repository_id", "day"])
      .merge(["captured_at", "payload"]);
  }

  async saveContributorMetrics(options: {
    day: Day;
    capturedAt: Date;
    metrics: ReadonlyMap<string, WakaTimeMetrics>;
  }): Promise<void> {
    const rows = [...options.metrics.entries()].map(([contributorKey, metrics]) => ({
      day: options.day,
      contributor_key: contributorKey,
      captured_at: options.capturedAt,
      payload: JSON.stringify(metrics),
    }));
    if (rows.length === 0) return;

    for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
      await this.client(CONTRIBUTOR_METRICS)
        .insert(rows.slice(index, index + INSERT_BATCH_SIZE))
        .onConflict(["day", "contributor_key"])
        .merge(["captured_at", "payload"]);
    }
  }

  async listLatestContributorMetrics(day: Day): Promise<Map<string, WakaTimeMetrics>> {
    const rows = await this.client<{
      day: Date | string;
      contributor_key: string;
      payload: string;
    }>(CONTRIBUTOR_METRICS)
      .where("day", "<=", day)
      .orderBy("contributor_key")
      .orderBy("day", "desc");

    const latest = new Map<string, WakaTimeMetrics>();
    for (const row of rows) {
      if (latest.has(row.contributor_key)) continue;
      latest.set(row.contributor_key, JSON.parse(row.payload) as WakaTimeMetrics);
    }
    return latest;
  }

  async listLatestSnapshots(options: {
    day: Day;
    repositoryIds?: readonly string[];
  }): Promise<RepositorySnapshot[]> {
    const query = this.client<SnapshotRow>(SNAPSHOTS).where("day", "<=", options.day);
    if (options.repositoryIds) {
      query.whereIn("repository_id", [...options.repositoryIds]);
    }

    const rows = await query.orderBy("repository_id").orderBy("day", "desc");

    // One row per repository, the newest at or before the requested day. Doing
    // this in memory rather than with a window function keeps the query
    // portable across SQLite and PostgreSQL; the row count is bounded by the
    // number of tracked repositories times the retention window.
    const latest = new Map<string, SnapshotRow>();
    for (const row of rows) {
      if (!latest.has(row.repository_id)) latest.set(row.repository_id, row);
    }

    return [...latest.values()].map((row) => ({
      repositoryId: row.repository_id,
      day: fromStoredDate(row.day),
      capturedAt: toDate(row.captured_at),
      payload: JSON.parse(row.payload) as RepositorySnapshotPayload,
    }));
  }

  async listEvents(options: {
    from: Date;
    to: Date;
    kinds?: readonly EventKind[];
    repositoryIds?: readonly string[];
  }): Promise<CodeHealthEvent[]> {
    const query = this.client<EventRow>(EVENTS)
      .where("occurred_at", ">=", options.from)
      .andWhere("occurred_at", "<", options.to);

    if (options.kinds) query.whereIn("kind", [...options.kinds]);
    if (options.repositoryIds) query.whereIn("repository_id", [...options.repositoryIds]);

    const rows = await query.orderBy("occurred_at", "asc");
    return rows.map(toEvent);
  }

  async getCoverage(): Promise<CoverageCounts> {
    const [bounds] = await this.client(CHUNKS).select(
      this.client.raw("min(day) as earliest"),
      this.client.raw("max(day) as latest"),
      this.client.raw("max(ingested_at) as last_ingested_at"),
    );

    const states = await this.client<IngestionStateRow>(INGESTION_STATE)
      .innerJoin<RepositoryRow>(REPOSITORIES, `${REPOSITORIES}.id`, `${INGESTION_STATE}.repository_id`)
      .whereNull(`${REPOSITORIES}.removed_at`)
      .select(
        `${INGESTION_STATE}.backfill_floor`,
        `${INGESTION_STATE}.backfill_cursor`,
        `${INGESTION_STATE}.status`,
        `${INGESTION_STATE}.incremental_through`,
      );

    const expectedDays = states.reduce(
      (total, row) =>
        total + Math.max(0, daysBetween(fromStoredDate(row.backfill_floor), toDay(new Date())) + 1),
      0,
    );
    const pendingDays = states.reduce(
      (total, row) =>
        total +
        Math.max(0, daysBetween(fromStoredDate(row.backfill_floor), fromStoredDate(row.backfill_cursor))),
      0,
    );

    const earliest = (bounds as { earliest?: Date | string | null } | undefined)?.earliest;
    const latest = (bounds as { latest?: Date | string | null } | undefined)?.latest;
    const lastIngestedAt = (bounds as { last_ingested_at?: Date | string | null } | undefined)
      ?.last_ingested_at;

    // The *minimum* across repositories, not the maximum: the dashboard can
    // only claim to answer up to the point the least fresh repository reaches.
    const freshUntil = states
      .map((row) => toDate(row.incremental_through).getTime())
      .reduce<number | null>(
        (earliestSoFar, value) =>
          earliestSoFar === null ? value : Math.min(earliestSoFar, value),
        null,
      );

    return {
      freshUntil: freshUntil === null ? null : new Date(freshUntil),
      earliestDay: earliest === null || earliest === undefined ? null : fromStoredDate(earliest),
      latestDay: latest === null || latest === undefined ? null : fromStoredDate(latest),
      lastIngestedAt:
        lastIngestedAt === null || lastIngestedAt === undefined ? null : toDate(lastIngestedAt),
      repositories: states.length,
      complete: states.filter((row) => row.status === "complete").length,
      failing: states.filter((row) => row.status === "error").length,
      ingestedDays: Math.max(0, expectedDays - pendingDays),
      expectedDays,
    };
  }
}
