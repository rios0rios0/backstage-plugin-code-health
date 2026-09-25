import type { ClaudeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { Day } from "../entities/day";
import type { ObservedIdentity } from "./identity_resolver";
import type { EnrichmentContext } from "./snapshot_enricher";

export interface ClaudeHarvest {
  readonly identities: readonly ObservedIdentity[];
  readonly metrics: ReadonlyMap<string, ClaudeMetrics>;
}

/** Returns a complete day or throws; a partial page set must never be persisted. */
export interface ClaudeEnricher {
  fetchDay(day: Day, context: EnrichmentContext): Promise<ClaudeHarvest>;
}
