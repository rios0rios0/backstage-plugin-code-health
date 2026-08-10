/**
 * Configuration schema for the Code Health backend plugin.
 *
 * Repository credentials are deliberately absent: the plugin authenticates to
 * GitHub and Azure DevOps through the host application's existing
 * `integrations` configuration, so there is no second copy of a token to
 * rotate. The only secret declared here is the WakaTime key, which has no
 * `integrations` equivalent.
 */
export interface Config {
  codeHealth?: {
    catalog?: {
      /**
       * Entity filters passed straight through to the catalog when discovering
       * repositories. Each list entry is one filter, and an entity matching any
       * of them is tracked. Defaults to `[{ kind: 'Component' }]`.
       *
       * Only entities that also resolve to a supported repository — through
       * `github.com/project-slug`, `dev.azure.com/project-repo`, or a
       * `backstage.io/source-location` pointing at a configured integration —
       * are ingested; the rest are skipped.
       *
       * @visibility backend
       */
      entityFilter?: Array<{ [key: string]: string | string[] }>;
    };

    ingestion?: {
      /**
       * How far back the background actor walks, in days. Defaults to 365.
       *
       * @visibility backend
       */
      retentionDays?: number;

      /**
       * Size of one backfill step, as an ISO 8601 duration. Defaults to `P1D`,
       * which walks the history a day at a time.
       *
       * Larger steps finish the backfill proportionally faster, because both
       * providers accept an arbitrary date range in a single request; the cost
       * is coarser resume granularity when a run is interrupted.
       *
       * @visibility backend
       */
      backfillChunk?: string;

      /**
       * Hard ceiling on provider requests issued per scheduled run, per host.
       * Defaults to 500. When the budget is spent the run stops and leaves its
       * cursors untouched, so the next run resumes where it left off.
       *
       * @visibility backend
       */
      requestBudgetPerRun?: number;

      /**
       * Maximum number of requests in flight against one provider host.
       * Defaults to 4. The gateway lowers this on its own when the provider
       * reports that it is close to throttling.
       *
       * @visibility backend
       */
      concurrencyPerHost?: number;

      /**
       * How often the ingestion actor runs. Defaults to every 5 minutes with a
       * 15 minute timeout and a 30 second initial delay.
       *
       * @visibility backend
       */
      schedule?: {
        frequency?: { [key: string]: number | string } | string;
        timeout?: { [key: string]: number | string } | string;
        initialDelay?: { [key: string]: number | string } | string;
        scope?: 'global' | 'local';
      };

      /**
       * How often the catalog is re-read for repositories to track. Defaults to
       * every 30 minutes with a 10 minute timeout.
       *
       * @visibility backend
       */
      discoverySchedule?: {
        frequency?: { [key: string]: number | string } | string;
        timeout?: { [key: string]: number | string } | string;
        initialDelay?: { [key: string]: number | string } | string;
        scope?: 'global' | 'local';
      };

      /**
       * How often the current-state snapshot is captured. Defaults to daily at
       * 03:00 with a one hour timeout.
       *
       * Compliance checks, README badges and Sonar measures cannot be
       * backfilled — no provider exposes their past state — so their history
       * starts at the first snapshot after installation.
       *
       * @visibility backend
       */
      snapshotSchedule?: {
        frequency?: { [key: string]: number | string } | string;
        timeout?: { [key: string]: number | string } | string;
        initialDelay?: { [key: string]: number | string } | string;
        scope?: 'global' | 'local';
      };
    };

    sonar?: {
      /**
       * Whether to enrich snapshots with Sonar measures. Defaults to false.
       *
       * When enabled the snapshot task calls the `sonarqube` backend plugin
       * over the internal service-to-service channel, so the Sonar token stays
       * where that plugin already keeps it. Requires
       * `@backstage-community/plugin-sonarqube-backend` to be installed and the
       * entity to carry a `sonarqube.org/project-key` annotation.
       *
       * @visibility backend
       */
      enabled?: boolean;
    };

    wakaTime?: {
      /**
       * WakaTime organisation whose members are summarised.
       *
       * @visibility backend
       */
      organization?: string;

      /**
       * WakaTime API key. Read only by the backend and never sent to a browser.
       *
       * @visibility secret
       */
      apiKey?: string;

      /**
       * WakaTime API base URL. Defaults to `https://wakatime.com/api/v1`.
       *
       * @visibility backend
       */
      baseUrl?: string;
    };
  };
}
