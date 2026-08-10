import type { TimeRangeId } from "./time_range";
import { DEFAULT_RANGE_ID } from "./time_range";

/**
 * The handful of values an administrator can pin in `app-config.yaml`.
 *
 * Everything that used to live here — the platform, the organisation, provider
 * base URLs and proxy paths — moved to the backend. The catalog decides which
 * repositories exist and the host application's `integrations` block supplies
 * the credentials, so there is nothing left for a browser to be told.
 */
export interface CodeHealthConfig {
  /** Auto-refresh interval in milliseconds, or null for the built-in default. */
  readonly refreshIntervalMs: number | null;
  readonly defaultRange: TimeRangeId;
}

export const DEFAULT_CODE_HEALTH_CONFIG: CodeHealthConfig = {
  refreshIntervalMs: null,
  defaultRange: DEFAULT_RANGE_ID,
};
