import type { EventKind } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../../src/domain/entities/code_health_event";
import { eventId } from "../../src/domain/entities/code_health_event";
import { addDays, daysBetween, toDay, type Day } from "../../src/domain/entities/day";
import type { IngestionState } from "../../src/domain/entities/ingestion_state";
import type { RepositorySnapshot } from "../../src/domain/entities/repository_snapshot";
import type {
  DiscoveredRepository,
  TrackedRepository,
} from "../../src/domain/entities/tracked_repository";
import type {
  CodeHealthStore,
  CoverageCounts,
  RecordChunkRequest,
  TrackedRepositoryWithState,
} from "../../src/domain/repositories/code_health_store";

const chunkKey = (repositoryId: string, kind: EventKind, day: Day) =>
  `${repositoryId}:${kind}:${day}`;

/**
 * In-memory implementation of the persistence port.
 *
 * It mirrors the real store's observable behaviour — idempotent event writes,
 * cursors that only move on success, soft deletes — so commands can be tested
 * without a database. The SQL itself is covered separately, against a real
 * engine, because only the real engine can prove the schema.
 */
export class InMemoryCodeHealthStore implements CodeHealthStore {
  private repositories = new Map<string, TrackedRepository>();
  private states = new Map<string, IngestionState>();
  private events = new Map<string, CodeHealthEvent>();
  private chunks = new Map<string, Date>();
  private snapshots = new Map<string, RepositorySnapshot>();

  /** Number of `commitIngestion` calls, so tests can assert on write volume. */
  commitCount = 0;
  /** Errors passed to `recordIngestionFailure`, newest last. */
  readonly failures: Array<{ repositoryId: string; error: string }> = [];

  async syncRepositories(options: {
    discovered: readonly DiscoveredRepository[];
    retentionDays: number;
    now: Date;
  }): Promise<{ inserted: string[]; updated: string[]; removed: string[] }> {
    const today = toDay(options.now);
    const floor = addDays(today, -options.retentionDays);
    const discoveredIds = new Set(options.discovered.map((item) => item.id));

    const inserted: string[] = [];
    const updated: string[] = [];

    for (const repository of options.discovered) {
      const existing = this.repositories.get(repository.id);
      if (existing) {
        this.repositories.set(repository.id, {
          ...existing,
          ...repository,
          defaultBranch: existing.defaultBranch,
          externalId: existing.externalId,
          lastSeenAt: options.now,
          removedAt: null,
        });
        updated.push(repository.id);
      } else {
        this.repositories.set(repository.id, {
          ...repository,
          discoveredAt: options.now,
          lastSeenAt: options.now,
          removedAt: null,
        });
        this.states.set(repository.id, {
          repositoryId: repository.id,
          backfillFloor: floor,
          backfillCursor: today,
          incrementalThrough: new Date(options.now.getTime() - 24 * 60 * 60 * 1000),
          status: "pending",
          failureCount: 0,
          lastError: null,
          lastAttemptAt: null,
        });
        inserted.push(repository.id);
      }
    }

    const removed: string[] = [];
    for (const [id, repository] of this.repositories) {
      if (discoveredIds.has(id) || repository.removedAt !== null) continue;
      this.repositories.set(id, { ...repository, removedAt: options.now });
      removed.push(id);
    }

    return { inserted, updated, removed };
  }

  async updateRepositoryFacts(options: {
    repositoryId: string;
    defaultBranch?: string | null;
    externalId?: string | null;
    archived?: boolean;
  }): Promise<void> {
    const existing = this.repositories.get(options.repositoryId);
    if (!existing) return;
    this.repositories.set(options.repositoryId, {
      ...existing,
      defaultBranch:
        options.defaultBranch === undefined ? existing.defaultBranch : options.defaultBranch,
      externalId: options.externalId === undefined ? existing.externalId : options.externalId,
      archived: options.archived === undefined ? existing.archived : options.archived,
    });
  }

  async listTrackedRepositories(): Promise<TrackedRepositoryWithState[]> {
    return [...this.repositories.values()]
      .filter((repository) => repository.removedAt === null)
      .map((repository) => ({
        repository,
        state: this.states.get(repository.id)!,
      }));
  }

  async getTrackedRepository(id: string): Promise<TrackedRepositoryWithState | undefined> {
    const repository = this.repositories.get(id);
    const state = this.states.get(id);
    if (!repository || !state) return undefined;
    return { repository, state };
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
    this.commitCount += 1;

    for (const event of options.events) {
      this.events.set(eventId(event), event);
    }

    for (const kind of options.chunk.kinds) {
      for (const day of options.chunk.days) {
        this.chunks.set(
          chunkKey(options.chunk.repositoryId, kind, day),
          options.chunk.ingestedAt,
        );
      }
    }

    const state = this.states.get(options.repositoryId);
    if (!state) return;

    this.states.set(options.repositoryId, {
      ...state,
      incrementalThrough: options.incrementalThrough ?? state.incrementalThrough,
      backfillCursor: options.backfillCursor ?? state.backfillCursor,
      status: options.status,
      failureCount: 0,
      lastError: null,
      lastAttemptAt: options.now,
    });
  }

  async recordIngestionFailure(options: {
    repositoryId: string;
    error: string;
    now: Date;
  }): Promise<void> {
    this.failures.push({ repositoryId: options.repositoryId, error: options.error });

    const state = this.states.get(options.repositoryId);
    if (!state) return;

    this.states.set(options.repositoryId, {
      ...state,
      status: "error",
      failureCount: state.failureCount + 1,
      lastError: options.error,
      lastAttemptAt: options.now,
    });
  }

  async saveSnapshot(snapshot: RepositorySnapshot): Promise<void> {
    this.snapshots.set(`${snapshot.repositoryId}:${snapshot.day}`, snapshot);
  }

  async listLatestSnapshots(options: {
    day: Day;
    repositoryIds?: readonly string[];
  }): Promise<RepositorySnapshot[]> {
    const allowed = options.repositoryIds ? new Set(options.repositoryIds) : null;
    const latest = new Map<string, RepositorySnapshot>();

    for (const snapshot of [...this.snapshots.values()].sort((a, b) =>
      a.day.localeCompare(b.day),
    )) {
      if (snapshot.day > options.day) continue;
      if (allowed && !allowed.has(snapshot.repositoryId)) continue;
      latest.set(snapshot.repositoryId, snapshot);
    }

    return [...latest.values()];
  }

  async listEvents(options: {
    from: Date;
    to: Date;
    kinds?: readonly EventKind[];
    repositoryIds?: readonly string[];
  }): Promise<CodeHealthEvent[]> {
    const kinds = options.kinds ? new Set(options.kinds) : null;
    const repositoryIds = options.repositoryIds ? new Set(options.repositoryIds) : null;

    return [...this.events.values()]
      .filter((event) => event.occurredAt >= options.from && event.occurredAt < options.to)
      .filter((event) => (kinds ? kinds.has(event.kind) : true))
      .filter((event) => (repositoryIds ? repositoryIds.has(event.repositoryId) : true))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async getCoverage(): Promise<CoverageCounts> {
    const days = [...this.chunks.keys()].map((key) => key.split(":")[2]).sort();
    const states = [...this.states.entries()]
      .filter(([id]) => this.repositories.get(id)?.removedAt === null)
      .map(([, state]) => state);

    const today = toDay(new Date());
    const expectedDays = states.reduce(
      (total, state) => total + Math.max(0, daysBetween(state.backfillFloor, today) + 1),
      0,
    );
    const pendingDays = states.reduce(
      (total, state) =>
        total + Math.max(0, daysBetween(state.backfillFloor, state.backfillCursor)),
      0,
    );

    return {
      earliestDay: days.at(0) ?? null,
      latestDay: days.at(-1) ?? null,
      lastIngestedAt: [...this.chunks.values()].sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      repositories: states.length,
      complete: states.filter((state) => state.status === "complete").length,
      failing: states.filter((state) => state.status === "error").length,
      ingestedDays: Math.max(0, expectedDays - pendingDays),
      expectedDays,
    };
  }
}
