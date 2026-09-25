import { mergeClaudeMetrics, type ClaudeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { Day } from "../../domain/entities/day";
import type { ClaudeEnricher, ClaudeHarvest } from "../../domain/services/claude_enricher";
import type { ObservedIdentity } from "../../domain/services/identity_resolver";
import type { EnrichmentContext } from "../../domain/services/snapshot_enricher";
import type { ProviderGateway } from "../http/provider_gateway";
import { parseClaudePage } from "./claude_node";

export class ClaudeApiEnricher implements ClaudeEnricher {
  constructor(private readonly options: {
    readonly gateway: ProviderGateway;
    readonly apiKey: string;
    /** Transport seam for provider contract tests; production uses Anthropic only. */
    readonly baseUrl?: string;
  }) {}

  async fetchDay(day: Day, context: EnrichmentContext): Promise<ClaudeHarvest> {
    const identities = new Map<string, ObservedIdentity>();
    const metrics = new Map<string, ClaudeMetrics>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const url = new URL("/v1/organizations/usage_report/claude_code", this.options.baseUrl ?? "https://api.anthropic.com");
      url.searchParams.set("starting_at", day);
      url.searchParams.set("limit", "1000");
      if (cursor !== null) url.searchParams.set("page", cursor);
      const response = await this.options.gateway.request({
        url: url.toString(), signal: context.signal,
        headers: {
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
          "User-Agent": "backstage-plugin-code-health (https://github.com/rios0rios0/backstage-plugin-code-health)",
        },
      }, context.budget);
      if (response.status !== 200) throw new Error(`Claude analytics returned HTTP ${response.status}`);
      const page = parseClaudePage(JSON.parse(response.body) as unknown, day);
      for (const record of page.records) {
        const key = record.identity.sourceKey;
        identities.set(key, record.identity);
        const previous = metrics.get(key);
        metrics.set(key, mergeClaudeMetrics(previous === undefined ? [record.metrics] : [previous, record.metrics]) as ClaudeMetrics);
      }
      cursor = page.nextPage;
      if (cursor !== null) {
        if (cursors.has(cursor)) throw new Error("Repeated Claude analytics cursor");
        cursors.add(cursor);
      }
    } while (cursor !== null);
    return { identities: [...identities.values()], metrics };
  }
}
