import type { LoggerService } from "@backstage/backend-plugin-api";
import type {
  ConfluenceContributorMetrics,
  JiraContributorMetrics,
  Platform,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { addDays, daysInRange, toDay, type Day } from "../entities/day";
import type { IdentityObserver } from "../services/identity_resolver";
import type { IngestionSettings } from "../entities/ingestion_settings";
import { CircuitOpenError } from "../entities/provider_errors";
import { BudgetExhaustedError, RequestBudget } from "../entities/request_budget";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { ConfluenceEnricher } from "../services/confluence_enricher";
import type { JiraEnricher } from "../services/jira_enricher";
import type { SonarEnricher, WakaTimeEnricher } from "../services/snapshot_enricher";
import type { VcsCollector } from "../services/vcs_collector";

export interface SnapshotRunResult {
  readonly captured: number;
  /** Accounts WakaTime reported, whether or not they logged any time. */
  readonly wakaTimeMembers: number;
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
  /**
   * How much WakaTime history to read, and how many of its most recent days to
   * also pull AI figures for. `aiDays` is zero when the option is off, so the
   * command has one number to obey rather than a flag and a number that can
   * disagree.
   */
  readonly wakaTimeWindow: { readonly historyDays: number; readonly aiDays: number };
  readonly jira: JiraEnricher | null;
  readonly confluence: ConfluenceEnricher | null;
  readonly identities: IdentityObserver;
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
    const { store, settings, logger, sonar } = this.options;
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

    const wakaTimeMembers = await this.harvestWakaTime(day, context, input.now);

    const tracked = await store.listTrackedRepositories();
    const repositories = tracked.map((entry) => entry.repository);

    // Both Atlassian sweeps run once for the whole pass, for the same reason
    // WakaTime does: people are not partitioned by repository, so asking per
    // repository would multiply one answer by the repository count.
    await this.harvestJira(day, context, input.now);
    await this.harvestConfluence(day, context, input.now);

    const jiraByRepository = await this.repositoryMetrics(
      "Jira",
      () => this.options.jira?.fetchRepositories(repositories, context),
    );
    const confluenceByRepository = await this.repositoryMetrics(
      "Confluence",
      () => this.options.confluence?.fetchRepositories(repositories, context),
    );

    for (const entry of tracked) {
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
            jiraMetrics: jiraByRepository.get(entry.repository.id) ?? null,
            confluenceMetrics: confluenceByRepository.get(entry.repository.id) ?? null,
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
        `${budget.spent} requests, ${wakaTimeMembers} WakaTime members`,
    );

    return {
      captured,
      wakaTimeMembers,
      failures,
      requestsSpent: budget.spent,
      budgetExhausted: budgetExhausted || budget.isExhausted,
      skippedHosts: [...skippedHosts],
    };
  }

  /**
   * Collects WakaTime for the whole configured history in one pass.
   *
   * The window is re-read in full on every run rather than only for the days
   * not yet stored, because it costs the same: the summaries resource answers
   * for an arbitrary span in a single request per member, so asking for thirty
   * days is one request and asking for one day is also one request. Re-reading
   * also repairs a day that was collected while somebody's editor was offline
   * and has since synchronised.
   *
   * The AI figures are the opposite shape — the durations resource takes a
   * single date — so only the most recent few days are asked for each run. That
   * means AI history accumulates forwards from the day the option was switched
   * on rather than being backfilled, which is stated in the documentation
   * because a chart that starts in the middle otherwise looks like a bug.
   */
  private async harvestWakaTime(
    today: Day,
    context: { budget: RequestBudget; signal?: AbortSignal },
    now: Date,
  ): Promise<number> {
    const { store, logger, wakaTime, wakaTimeWindow, identities } = this.options;
    if (wakaTime === null) return 0;

    const from = addDays(today, -(wakaTimeWindow.historyDays - 1));
    const aiDays =
      wakaTimeWindow.aiDays > 0
        ? daysInRange(addDays(today, -(wakaTimeWindow.aiDays - 1)), today)
        : [];

    const harvest = await wakaTime
      .fetchWindow({ from, to: today, aiDays, context })
      .catch((error: unknown) => {
        logger.warn(`WakaTime enrichment failed: ${String(error)}`);
        return null;
      });

    if (harvest === null) return 0;

    // Recorded before the measures, and whether or not anything was logged: an
    // account that coded nothing all month is still an account somebody may
    // need to link, and the Identities screen is where they would look for it.
    await identities.observe(harvest.identities, now);

    for (const [day, metrics] of harvest.byDay) {
      if (metrics.size === 0) continue;
      await store.saveContributorMetrics({
        source: "wakatime",
        day,
        capturedAt: now,
        metrics,
      });
    }

    return harvest.identities.length;
  }

  /**
   * Per-repository measures from one optional enricher.
   *
   * A failing integration costs its own numbers and nothing else. The snapshot
   * is the only pass that can record the day's compliance and quality state at
   * all, so losing it to somebody's expired Atlassian token would be a far
   * larger hole than the one it was trying to fill.
   */
  private async repositoryMetrics<T>(
    label: string,
    fetch: () => Promise<ReadonlyMap<string, T>> | undefined,
  ): Promise<ReadonlyMap<string, T>> {
    const result = fetch();
    if (result === undefined) return new Map<string, T>();

    return result.catch((error: unknown) => {
      this.options.logger.warn(`${label} repository enrichment failed: ${String(error)}`);
      return new Map<string, T>();
    });
  }

  /**
   * Jira, stored a day at a time.
   *
   * The per-day slice costs nothing extra — the enricher fetches the window's
   * issues once and slices them arithmetically — and it is the difference
   * between a range picker that can answer for last March and one that shows a
   * trailing window relabelled with March's dates. Days with no activity are
   * absent rather than empty, so "nobody did anything" stays distinguishable
   * from "not collected".
   */
  private async harvestJira(
    today: Day,
    context: { budget: RequestBudget; signal?: AbortSignal },
    now: Date,
  ): Promise<void> {
    const { store, logger, jira } = this.options;
    if (jira === null) return;

    const byDay = await jira.fetchContributorsByDay(context).catch((error: unknown) => {
      logger.warn(`Jira enrichment failed: ${String(error)}`);
      return new Map<Day, ReadonlyMap<string, JiraContributorMetrics>>();
    });

    for (const [day, metrics] of byDay) {
      if (metrics.size === 0) continue;
      await store.saveContributorMetrics({
        source: "jira",
        day,
        capturedAt: now,
        metrics,
      });
    }

    if (byDay.size === 0) {
      logger.debug(`no Jira activity to record for the window ending ${today}`);
    }
  }

  /**
   * Confluence, stored as one row for the whole window.
   *
   * Unlike Jira, the sweep cannot be sliced per day for free: measuring written
   * volume walks a page's version bodies, and doing that per day would multiply
   * the walks by the length of the window. The figures therefore describe a
   * trailing window rather than the range the picker is showing, which the
   * columns and the card say out loud rather than leaving a reader to assume.
   */
  private async harvestConfluence(
    day: Day,
    context: { budget: RequestBudget; signal?: AbortSignal },
    now: Date,
  ): Promise<void> {
    const { store, logger, confluence } = this.options;
    if (confluence === null) return;

    const metrics = await confluence.fetchContributors(context).catch((error: unknown) => {
      logger.warn(`Confluence enrichment failed: ${String(error)}`);
      return new Map<string, ConfluenceContributorMetrics>();
    });

    if (metrics.size === 0) return;
    await store.saveContributorMetrics({
      source: "confluence",
      day,
      capturedAt: now,
      metrics,
    });
  }
}
