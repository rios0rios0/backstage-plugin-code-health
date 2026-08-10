import type { EventKind } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../entities/code_health_event";
import type { Day } from "../entities/day";
import type { IngestionState } from "../entities/ingestion_state";
import type { RepositorySnapshot } from "../entities/repository_snapshot";
import type { DiscoveredRepository, TrackedRepository } from "../entities/tracked_repository";

/** A repository together with where its ingestion has got to. */
export interface TrackedRepositoryWithState {
  readonly repository: TrackedRepository;
  readonly state: IngestionState;
}

export interface RecordChunkRequest {
  readonly repositoryId: string;
  readonly kinds: readonly EventKind[];
  readonly days: readonly Day[];
  readonly ingestedAt: Date;
}

export interface CoverageCounts {
  readonly earliestDay: Day | null;
  readonly latestDay: Day | null;
  readonly lastIngestedAt: Date | null;
  readonly repositories: number;
  readonly complete: number;
  readonly failing: number;
  readonly ingestedDays: number;
  readonly expectedDays: number;
}

/**
 * Persistence for everything the plugin ingests.
 *
 * This is one port rather than four because the writes are not independent: an
 * ingestion step has to store its events, record the days it covered, and move
 * its cursor as a single unit. Splitting those across separate repositories
 * would put the transaction boundary outside the port, where a partial failure
 * could advance a cursor past events that were never written.
 */
export interface CodeHealthStore {
  /**
   * Reconciles the tracked set with what the catalog currently holds: inserts
   * new repositories with a fresh ingestion cursor, refreshes the ones still
   * present, and soft-deletes the ones that disappeared.
   *
   * @returns the identifiers of repositories that were newly inserted.
   */
  syncRepositories(options: {
    discovered: readonly DiscoveredRepository[];
    retentionDays: number;
    now: Date;
  }): Promise<{ inserted: string[]; updated: string[]; removed: string[] }>;

  /**
   * Records facts learnt from the provider rather than from the catalog — the
   * default branch, the provider-side identifier, whether the repository is
   * archived. Discovery must not overwrite these, because the catalog does not
   * know them and always reports null.
   */
  updateRepositoryFacts(options: {
    repositoryId: string;
    defaultBranch?: string | null;
    externalId?: string | null;
    archived?: boolean;
  }): Promise<void>;

  listTrackedRepositories(): Promise<TrackedRepositoryWithState[]>;

  getTrackedRepository(id: string): Promise<TrackedRepositoryWithState | undefined>;

  /**
   * Stores events, records the days they cover, and advances the cursors — all
   * in one transaction, so a crash can never leave a cursor claiming a window
   * whose events were lost.
   */
  commitIngestion(options: {
    repositoryId: string;
    events: readonly CodeHealthEvent[];
    chunk: RecordChunkRequest;
    incrementalThrough?: Date;
    backfillCursor?: Day;
    status: IngestionState["status"];
    now: Date;
  }): Promise<void>;

  recordIngestionFailure(options: {
    repositoryId: string;
    error: string;
    now: Date;
  }): Promise<void>;

  saveSnapshot(snapshot: RepositorySnapshot): Promise<void>;

  /** Most recent snapshot at or before `day`, per repository. */
  listLatestSnapshots(options: {
    day: Day;
    repositoryIds?: readonly string[];
  }): Promise<RepositorySnapshot[]>;

  listEvents(options: {
    from: Date;
    to: Date;
    kinds?: readonly EventKind[];
    repositoryIds?: readonly string[];
  }): Promise<CodeHealthEvent[]>;

  getCoverage(): Promise<CoverageCounts>;
}
