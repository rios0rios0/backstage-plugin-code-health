import type { ContributorSummary } from "./contributor_summary";
import type { CoverageInfo } from "./coverage";
import type { RepositorySummary } from "./repository_summary";
import type { TimeSeriesBucket, TimeSeriesPoint } from "./time_series";

/**
 * The plugin id both packages register under. The frontend resolves the backend
 * with `discoveryApi.getBaseUrl(CODE_HEALTH_PLUGIN_ID)`, which only works
 * because the backend plugin claims the same id.
 */
export const CODE_HEALTH_PLUGIN_ID = "code-health";

/** Version prefix of every data route, so a future shape change can coexist. */
export const CODE_HEALTH_API_VERSION = "v1";

/**
 * A half-open window `[from, to)` of ISO 8601 instants. Leaving it out asks for
 * the last 24 hours, which is what a freshly installed plugin can answer before
 * any history exists.
 */
export interface TimeWindow {
  readonly from: string;
  readonly to: string;
}

export interface ListRepositoriesResponse {
  readonly window: TimeWindow;
  readonly items: readonly RepositorySummary[];
}

export interface ListContributorsResponse {
  readonly window: TimeWindow;
  readonly items: readonly ContributorSummary[];
}

export interface GetTimeSeriesResponse {
  readonly window: TimeWindow;
  readonly bucket: TimeSeriesBucket;
  readonly points: readonly TimeSeriesPoint[];
}

export type GetCoverageResponse = CoverageInfo;

export interface RefreshResponse {
  /** Scheduler task ids that were triggered. */
  readonly triggered: readonly string[];
}
