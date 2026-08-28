import type {
  SonarMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { Day } from "../entities/day";
import type { RequestBudget } from "../entities/request_budget";
import type { TrackedRepository } from "../entities/tracked_repository";
import type { ObservedIdentity } from "./identity_resolver";

export interface EnrichmentContext {
  readonly budget: RequestBudget;
  readonly signal?: AbortSignal;
}

/**
 * Adds quality measures to a snapshot from a system that is not the version
 * control provider.
 *
 * Returning null is a normal outcome, not a failure: a repository with no Sonar
 * project simply has no measures, and the dashboard renders the absence rather
 * than a zero.
 */
export interface SonarEnricher {
  fetch(repository: TrackedRepository, context: EnrichmentContext): Promise<SonarMetrics | null>;
}

/**
 * What one WakaTime pass collected.
 *
 * The accounts come back alongside the numbers rather than being inferred from
 * them, because an account that logged nothing all week is still an account
 * somebody may need to link — and the Identities screen is exactly where they
 * would go looking for it.
 */
export interface WakaTimeHarvest {
  readonly identities: readonly ObservedIdentity[];
  /** Day, then the account key the source reported, then that day's measures. */
  readonly byDay: ReadonlyMap<Day, ReadonlyMap<string, WakaTimeMetrics>>;
}

/**
 * Reads coding time from WakaTime.
 *
 * Collected per *day* rather than as one rolling total, which is what lets the
 * range picker answer for a past month instead of always reporting the last
 * thirty days whatever was asked for. WakaTime is one of the few sources here
 * that can be backfilled at all — its summaries resource takes an arbitrary
 * start and end — so refusing to use that would throw away the only history the
 * plugin can get for free.
 */
export interface WakaTimeEnricher {
  fetchWindow(input: {
    readonly from: Day;
    readonly to: Day;
    /**
     * Days to also pull AI authorship and token counts for.
     *
     * Separate from the window because they come from a different resource that
     * is queried one day at a time: coding time for a whole month costs one
     * request per member, the AI figures cost one per member per day.
     */
    readonly aiDays: readonly Day[];
    readonly context: EnrichmentContext;
  }): Promise<WakaTimeHarvest>;
}
