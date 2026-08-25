/**
 * Configuration schema for the Code Health frontend plugin.
 *
 * Only presentation preferences live here now. The platform, the organisation,
 * provider base URLs, proxy paths and every credential moved to the backend
 * plugin: the Backstage catalog decides which repositories exist and the host
 * application's `integrations` block supplies the tokens, so there is nothing
 * left for a browser to be told and nothing for it to hold.
 */
export interface Config {
  codeHealth?: {
    /**
     * Auto-refresh interval in milliseconds. Accepted values are 60000, 300000,
     * 900000 and 0 (disabled). Defaults to 300000.
     *
     * @visibility frontend
     */
    refreshIntervalMs?: number;

    /**
     * Rolling time range selected when the dashboard opens. Defaults to `day`.
     *
     * `today` is the local calendar day so far, which is not the same as `day`
     * — that one is the last 24 hours. A range wider than the backend has
     * ingested falls back to the widest one available, so this can be set
     * optimistically while the first backfill is still running.
     *
     * A specific calendar month cannot be pinned here: it would be a fixed
     * month that goes stale the moment it passes.
     *
     * @visibility frontend
     */
    defaultRange?:
      | 'today'
      | 'hour'
      | 'day'
      | 'week'
      | 'month'
      | 'quarter'
      | 'year';
  };
}
