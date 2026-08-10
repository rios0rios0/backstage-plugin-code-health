import type {
  SonarMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { RequestBudget } from "../entities/request_budget";
import type { TrackedRepository } from "../entities/tracked_repository";

export interface EnrichmentContext {
  readonly budget: RequestBudget;
  readonly signal?: AbortSignal;
}

/**
 * Adds quality measures to a snapshot from a system that is not the version
 * control provider.
 *
 * Returning null is a normal outcome, not a failure: a repository with no Sonar
 * project or a plugin with no WakaTime key simply has no measures, and the
 * dashboard renders the absence rather than a zero.
 */
export interface SonarEnricher {
  fetch(repository: TrackedRepository, context: EnrichmentContext): Promise<SonarMetrics | null>;
}

export interface WakaTimeEnricher {
  /** Measures for the whole organisation, keyed by contributor identity. */
  fetchAll(context: EnrichmentContext): Promise<ReadonlyMap<string, WakaTimeMetrics>>;
}
