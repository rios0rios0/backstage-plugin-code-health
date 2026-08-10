import type { LoggerService } from "@backstage/backend-plugin-api";
import type {
  Platform,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { toDay } from "../entities/day";
import type { IngestionSettings } from "../entities/ingestion_settings";
import { CircuitOpenError } from "../entities/provider_errors";
import { BudgetExhaustedError, RequestBudget } from "../entities/request_budget";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { SonarEnricher, WakaTimeEnricher } from "../services/snapshot_enricher";
import type { VcsCollector } from "../services/vcs_collector";

export interface SnapshotRunResult {
  readonly captured: number;
  readonly failures: number;
  readonly requestsSpent: number;
  readonly budgetExhausted: boolean;
  readonly skippedHosts: readonly string[];
}

export interface CaptureRepositorySnapshotsOptions {
  readonly store: CodeHealthStore;
  readonly collectors: ReadonlyMap<Platform, VcsCollector>;
  readonly sonar: SonarEnricher | null;
  readonly wakaTime: WakaTimeEnricher | null;
  readonly settings: IngestionSettings;
  readonly logger: LoggerService;
}

/**
 * Captures each repository's current state once a day.
 *
 * Everything here is a fact no provider will report retroactively — compliance
 * checks, README badges, Sonar measures, the branch list. Their history
 * therefore starts at the first snapshot after installation rather than at the
 * retention floor, and the dashboard has to say so rather than draw a flat line
 * back through a year it never observed.
 *
 * The pass shares one project cache across repositories, which is what turns
 * Azure DevOps branch policies from a per-repository download into a
 * per-project one.
 */
export class CaptureRepositorySnapshots {
  constructor(private readonly options: CaptureRepositorySnapshotsOptions) {}

  async run(input: { now: Date; signal?: AbortSignal }): Promise<SnapshotRunResult> {
    const { store, settings, logger, sonar, wakaTime } = this.options;
    const budget = new RequestBudget(settings.requestBudgetPerRun);
    const projectCache = new Map<string, unknown>();
    const skippedHosts = new Set<string>();

    const day = toDay(input.now);
    let captured = 0;
    let failures = 0;
    let budgetExhausted = false;

    const context = {
      budget,
      projectCache,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    };

    // Fetched once for the whole pass: WakaTime reports per member for the
    // organisation, not per repository, so asking per repository would multiply
    // one answer by the repository count.
    const wakaTimeByContributor = wakaTime
      ? await wakaTime.fetchAll(context).catch((error: unknown) => {
          logger.warn(`WakaTime enrichment failed: ${String(error)}`);
          return new Map<string, WakaTimeMetrics>();
        })
      : new Map<string, WakaTimeMetrics>();

    if (wakaTimeByContributor.size > 0) {
      await store.saveContributorMetrics({
        day,
        capturedAt: input.now,
        metrics: wakaTimeByContributor,
      });
    }

    for (const entry of await store.listTrackedRepositories()) {
      if (input.signal?.aborted) break;
      if (budget.isExhausted) {
        budgetExhausted = true;
        break;
      }
      if (skippedHosts.has(entry.repository.host)) continue;

      const collector = this.options.collectors.get(entry.repository.platform);
      if (!collector) {
        logger.warn(`no collector is registered for ${entry.repository.platform}`);
        failures += 1;
        continue;
      }

      try {
        const snapshot = await collector.snapshot(entry.repository, context);
        const sonarMetrics = sonar ? await sonar.fetch(entry.repository, context) : null;

        await store.saveSnapshot({
          repositoryId: entry.repository.id,
          day,
          capturedAt: input.now,
          payload: {
            ...snapshot.payload,
            sonarMetrics,
            // WakaTime measures a person, not a repository, so there is nothing
            // meaningful to attach at this level; the contributors view joins
            // them on the contributor key instead.
            wakaTimeMetrics: null,
          },
        });

        if (snapshot.repositoryFacts) {
          await store.updateRepositoryFacts({
            repositoryId: entry.repository.id,
            ...snapshot.repositoryFacts,
          });
        }

        if (snapshot.events.length > 0) {
          await store.commitIngestion({
            repositoryId: entry.repository.id,
            events: snapshot.events,
            chunk: {
              repositoryId: entry.repository.id,
              // Releases and tags are recorded as they are observed rather than
              // as a fetched range: neither provider can list them by date, so
              // claiming a day was covered for them would be untrue.
              kinds: [],
              days: [],
              ingestedAt: input.now,
            },
            status: entry.state.status,
            now: input.now,
          });
        }

        captured += 1;
      } catch (error) {
        if (error instanceof BudgetExhaustedError) {
          budgetExhausted = true;
          break;
        }
        if (error instanceof CircuitOpenError) {
          skippedHosts.add(entry.repository.host);
          logger.warn(`skipping the rest of ${entry.repository.host}; it is in cooldown`);
          continue;
        }
        failures += 1;
        logger.warn(`snapshot failed for ${entry.repository.entityRef}: ${String(error)}`);
      }
    }

    logger.info(
      `snapshot pass finished: captured ${captured}, ${failures} failures, ` +
        `${budget.spent} requests, ${wakaTimeByContributor.size} WakaTime members`,
    );

    return {
      captured,
      failures,
      requestsSpent: budget.spent,
      budgetExhausted: budgetExhausted || budget.isExhausted,
      skippedHosts: [...skippedHosts],
    };
  }
}
