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
     * Time range selected when the dashboard opens. Defaults to `day`.
     *
     * A range wider than the backend has ingested falls back to the widest one
     * available, so this can be set optimistically while the first backfill is
     * still running.
     *
     * @visibility frontend
     */
    defaultRange?: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  };
}
