import type { ContributorSummary } from "./contributor_summary";
import type { CoverageInfo } from "./coverage";
import type { IdentityRow } from "./identity";
import type { IntegrationCapabilities } from "./integrations";
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

/**
 * What the backend is configured to do, asked once before anything is drawn.
 *
 * The alternative — inferring an integration from whether any row happens to
 * carry a value for it — cannot tell a switched-off integration from one that
 * is on and has not run yet, and those want completely different words on the
 * screen. It also makes a freshly configured install look broken for a day.
 */
export interface GetCapabilitiesResponse {
  readonly integrations: IntegrationCapabilities;
}

export interface ListIdentitiesResponse {
  readonly items: readonly IdentityRow[];
}

export interface LinkIdentityRequest {
  readonly source: string;
  readonly sourceKey: string;
  /** A `user:<namespace>/<name>` reference. */
  readonly entityRef: string;
}

export interface RefreshResponse {
  /** Scheduler task ids that were triggered. */
  readonly triggered: readonly string[];
}
