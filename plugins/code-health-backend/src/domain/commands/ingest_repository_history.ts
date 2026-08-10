import type { LoggerService } from "@backstage/backend-plugin-api";
import type { EventKind, Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../entities/code_health_event";
import { addDays, fullyCoveredDays, startOfDay, type Day } from "../entities/day";
import { CircuitOpenError } from "../entities/provider_errors";
import type { IngestionSettings } from "../entities/ingestion_settings";
import type { IngestionState } from "../entities/ingestion_state";
import { BudgetExhaustedError, RequestBudget } from "../entities/request_budget";
import type { TrackedRepository } from "../entities/tracked_repository";
import type {
  CodeHealthStore,
  TrackedRepositoryWithState,
} from "../repositories/code_health_store";
import type { VcsCollector } from "../services/vcs_collector";

/**
 * The kinds a collector is responsible for. A day is recorded as fetched for
 * all of them at once, including the ones that produced nothing, because
 * "no builds that day" and "builds never fetched" have to stay distinguishable.
 *
 * Releases and tags are absent on purpose: they are current-state facts the
 * snapshot task captures, not something either provider can date-range.
 */
const COLLECTED_KINDS: readonly EventKind[] = ["commit", "pull_request", "pr_review", "build"];

export interface IngestionRunResult {
  readonly refreshed: number;
  readonly backfilled: number;
  readonly eventsWritten: number;
  readonly requestsSpent: number;
  readonly budgetExhausted: boolean;
  readonly failures: number;
  readonly skippedHosts: readonly string[];
}

export interface IngestRepositoryHistoryOptions {
  readonly store: CodeHealthStore;
  /** Collector per platform, so a new platform is a map entry rather than a branch. */
  readonly collectors: ReadonlyMap<Platform, VcsCollector>;
  readonly settings: IngestionSettings;
  readonly logger: LoggerService;
}

/**
 * The background actor.
 *
 * It runs in two phases against one shared request allowance, and the order is
 * the whole design. The **incremental** phase moves each repository's forward
 * cursor towards now, so a freshly installed plugin can answer for the last day
 * on its very first run. Only what is left of the allowance then goes to the
 * **backfill** phase, which walks each repository backwards a chunk at a time
 * until it reaches the retention floor. That is what makes the selectable range
 * widen from today outwards while the dashboard stays current throughout.
 *
 * Nothing here is best-effort. A window that fails leaves its cursor untouched
 * and is retried on the next run, because advancing past unfetched data would
 * put a permanent hole in the history that nothing later would notice.
 */
export class IngestRepositoryHistory {
  constructor(private readonly options: IngestRepositoryHistoryOptions) {}

  async run(input: { now: Date; signal?: AbortSignal }): Promise<IngestionRunResult> {
    const { store, settings, logger } = this.options;
    const budget = new RequestBudget(settings.requestBudgetPerRun);
    const skippedHosts = new Set<string>();

    let refreshed = 0;
    let backfilled = 0;
    let eventsWritten = 0;
    let failures = 0;
    let budgetExhausted = false;

    const tracked = await store.listTrackedRepositories();

    const process = async (
      candidates: TrackedRepositoryWithState[],
      handler: (entry: TrackedRepositoryWithState) => Promise<number>,
      onSuccess: () => void,
    ): Promise<boolean> => {
      for (const entry of candidates) {
        if (input.signal?.aborted) return false;
        if (budget.isExhausted) return false;
        if (skippedHosts.has(entry.repository.host)) continue;

        try {
          eventsWritten += await handler(entry);
          onSuccess();
        } catch (error) {
          if (error instanceof BudgetExhaustedError) {
            budgetExhausted = true;
            return false;
          }
          if (error instanceof CircuitOpenError) {
            // The host is in cooldown. Every other repository on it would fail
            // the same way, so they are left for the next run rather than each
            // being recorded as a failure of its own.
            skippedHosts.add(entry.repository.host);
            logger.warn(
              `skipping the rest of ${entry.repository.host} this run; it is in cooldown`,
            );
            continue;
          }
          failures += 1;
          logger.warn(`ingestion failed for ${entry.repository.entityRef}: ${String(error)}`);
          await store.recordIngestionFailure({
            repositoryId: entry.repository.id,
            error: String(error),
            now: input.now,
          });
        }
      }
      return true;
    };

    await process(
      this.incrementalCandidates(tracked, input.now),
      (entry) => this.runIncremental(entry, budget, input),
      () => {
        refreshed += 1;
      },
    );

    await process(
      this.backfillCandidates(tracked),
      (entry) => this.runBackfill(entry, budget, input),
      () => {
        backfilled += 1;
      },
    );

    const budgetNote = budgetExhausted ? " (budget exhausted, resuming next run)" : "";
    logger.info(
      `ingestion run finished: refreshed ${refreshed}, backfilled ${backfilled}, ` +
        `${eventsWritten} events, ${budget.spent} requests${budgetNote}`,
    );

    return {
      refreshed,
      backfilled,
      eventsWritten,
      requestsSpent: budget.spent,
      budgetExhausted: budgetExhausted || budget.isExhausted,
      failures,
      skippedHosts: [...skippedHosts],
    };
  }

  /** Staleness first, so no repository starves while others are refreshed. */
  private incrementalCandidates(
    tracked: TrackedRepositoryWithState[],
    now: Date,
  ): TrackedRepositoryWithState[] {
    return tracked
      .filter((entry) => entry.state.incrementalThrough.getTime() < now.getTime())
      .sort(
        (a, b) => a.state.incrementalThrough.getTime() - b.state.incrementalThrough.getTime(),
      );
  }

  /**
   * Newest gap first, so the selectable range grows backwards from today. A
   * user gains "the last month" long before "the whole year", which is the
   * order the data becomes useful in.
   */
  private backfillCandidates(
    tracked: TrackedRepositoryWithState[],
  ): TrackedRepositoryWithState[] {
    return tracked
      .filter((entry) => entry.state.backfillCursor > entry.state.backfillFloor)
      .sort((a, b) => b.state.backfillCursor.localeCompare(a.state.backfillCursor));
  }

  private collectorFor(repository: TrackedRepository): VcsCollector {
    const collector = this.options.collectors.get(repository.platform);
    if (!collector) {
      throw new Error(`no collector is registered for ${repository.platform}`);
    }
    return collector;
  }

  private async runIncremental(
    entry: TrackedRepositoryWithState,
    budget: RequestBudget,
    input: { now: Date; signal?: AbortSignal },
  ): Promise<number> {
    const { repository, state } = entry;
    const from = state.incrementalThrough;
    // Capped at one chunk so a backend that was down for a week catches up over
    // several runs instead of asking one provider for a week in a single call.
    const capped = new Date(
      from.getTime() + this.options.settings.backfillChunkDays * 24 * 60 * 60 * 1000,
    );
    const to = capped < input.now ? capped : input.now;

    const collected = await this.collectorFor(repository).collect(
      repository,
      { from, to },
      { budget, ...(input.signal === undefined ? {} : { signal: input.signal }) },
    );

    await this.applyFacts(repository, collected.repositoryFacts);

    await this.options.store.commitIngestion({
      repositoryId: repository.id,
      events: this.stamp(collected.events, repository.id),
      chunk: {
        repositoryId: repository.id,
        kinds: COLLECTED_KINDS,
        days: fullyCoveredDays(from, to),
        ingestedAt: input.now,
      },
      incrementalThrough: to,
      status: this.statusAfter(state),
      now: input.now,
    });

    return collected.events.length;
  }

  private async runBackfill(
    entry: TrackedRepositoryWithState,
    budget: RequestBudget,
    input: { now: Date; signal?: AbortSignal },
  ): Promise<number> {
    const { repository, state } = entry;
    const nextCursor = this.previousCursor(state);
    const from = startOfDay(nextCursor);
    const to = startOfDay(state.backfillCursor);

    const collected = await this.collectorFor(repository).collect(
      repository,
      { from, to },
      { budget, ...(input.signal === undefined ? {} : { signal: input.signal }) },
    );

    await this.applyFacts(repository, collected.repositoryFacts);

    await this.options.store.commitIngestion({
      repositoryId: repository.id,
      events: this.stamp(collected.events, repository.id),
      chunk: {
        repositoryId: repository.id,
        kinds: COLLECTED_KINDS,
        days: fullyCoveredDays(from, to),
        ingestedAt: input.now,
      },
      backfillCursor: nextCursor,
      status: nextCursor <= state.backfillFloor ? "complete" : "active",
      now: input.now,
    });

    return collected.events.length;
  }

  /** One chunk further back, never past the retention floor. */
  private previousCursor(state: IngestionState): Day {
    const candidate = addDays(state.backfillCursor, -this.options.settings.backfillChunkDays);
    return candidate < state.backfillFloor ? state.backfillFloor : candidate;
  }

  private statusAfter(state: IngestionState): IngestionState["status"] {
    return state.backfillCursor <= state.backfillFloor ? "complete" : "active";
  }

  private async applyFacts(
    repository: TrackedRepository,
    facts: { defaultBranch?: string | null; externalId?: string | null; archived?: boolean } | undefined,
  ): Promise<void> {
    if (!facts) return;
    await this.options.store.updateRepositoryFacts({ repositoryId: repository.id, ...facts });
  }

  /**
   * Collectors are told which repository they are reading, but the identifier
   * on each event is what the store keys on, so it is set here rather than
   * trusted from the payload.
   */
  private stamp(events: readonly CodeHealthEvent[], repositoryId: string): CodeHealthEvent[] {
    return events.map((event) => ({ ...event, repositoryId }));
  }
}
