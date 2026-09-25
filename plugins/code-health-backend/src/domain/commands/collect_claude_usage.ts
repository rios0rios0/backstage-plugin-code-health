import type { LoggerService } from "@backstage/backend-plugin-api";
import { addDays, daysInRange, toDay } from "../entities/day";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { ClaudeEnricher } from "../services/claude_enricher";
import type { IdentityObserver } from "../services/identity_resolver";
import type { EnrichmentContext } from "../services/snapshot_enricher";

/** Backfills uncollected days first, then repairs the two most recent UTC days. */
export class CollectClaudeUsage {
  constructor(private readonly options: {
    readonly store: CodeHealthStore;
    readonly enricher: ClaudeEnricher;
    readonly identities: IdentityObserver;
    readonly historyDays: number;
    readonly logger: LoggerService;
  }) {}

  async run(now: Date, context: EnrichmentContext): Promise<void> {
    const today = toDay(now);
    const from = addDays(today, -(this.options.historyDays - 1));
    const collected = new Set(await this.options.store.listContributorMetricDays({ source: "claude", from, to: today }));
    const days = daysInRange(from, today).reverse();
    const pending = [...days.filter((day) => !collected.has(day)), ...days.filter((day) => collected.has(day) && day >= addDays(today, -1))];
    for (const day of pending) {
      if (context.signal?.aborted) break;
      try {
        const harvest = await this.options.enricher.fetchDay(day, context);
        await this.options.identities.observe(harvest.identities, now);
        await this.options.store.saveContributorMetrics({ source: "claude", day, capturedAt: now, metrics: harvest.metrics, complete: true });
      } catch {
        // Provider payloads can contain personal data; never log the response or credentials.
        this.options.logger.warn(`Claude usage collection stopped at ${day}; the day will be retried on the next pass`);
        break;
      }
    }
  }
}
