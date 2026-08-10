import { coreServices, createBackendPlugin } from "@backstage/backend-plugin-api";
import { ScmIntegrations } from "@backstage/integration";
import { catalogServiceRef } from "@backstage/plugin-catalog-node";
import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import { CODE_HEALTH_PLUGIN_ID } from "@rios0rios0/backstage-plugin-code-health-common";
import { CaptureRepositorySnapshots } from "./domain/commands/capture_repository_snapshots";
import { GetRepositoryTimeSeries } from "./domain/commands/get_repository_time_series";
import { DiscoverRepositories } from "./domain/commands/discover_repositories";
import { IngestRepositoryHistory } from "./domain/commands/ingest_repository_history";
import { ListContributorSummaries } from "./domain/commands/list_contributor_summaries";
import { ListRepositorySummaries } from "./domain/commands/list_repository_summaries";
import type { VcsCollector } from "./domain/services/vcs_collector";
import { createCodeHealthRouter } from "./infrastructure/controllers/code_health_router";
import { ProviderGateway } from "./infrastructure/http/provider_gateway";
import { KnexCodeHealthStore } from "./infrastructure/repositories/knex_code_health_store";
import { AnnotationRepositoryResolver } from "./infrastructure/services/annotation_repository_resolver";
import { BackstageCatalogReader } from "./infrastructure/services/backstage_catalog_reader";
import { readCodeHealthSettings } from "./infrastructure/services/backstage_settings_reader";
import { AzureDevOpsCollector } from "./infrastructure/services/collectors/azure_devops_collector";
import { GithubCollector } from "./infrastructure/services/collectors/github_collector";
import { IntegrationsCredentialsResolver } from "./infrastructure/services/integrations_credentials_resolver";
import { SonarqubeEnricher } from "./infrastructure/services/sonarqube_enricher";
import { WakaTimeApiEnricher } from "./infrastructure/services/wakatime_enricher";

export const DISCOVERY_TASK_ID = "code-health.discover";
export const INGESTION_TASK_ID = "code-health.ingest";
export const SNAPSHOT_TASK_ID = "code-health.snapshot";

/**
 * Code Health backend plugin.
 *
 * Discovers repositories from the Backstage catalog, ingests their history in a
 * rate-limited background job, and serves it to the frontend plugin. It claims
 * the same plugin id as the frontend, which is what makes
 * `discoveryApi.getBaseUrl('code-health')` resolve to this router.
 *
 * @public
 */
export const codeHealthPlugin = createBackendPlugin({
  pluginId: CODE_HEALTH_PLUGIN_ID,
  register(env) {
    env.registerInit({
      deps: {
        auth: coreServices.auth,
        catalog: catalogServiceRef,
        discovery: coreServices.discovery,
        config: coreServices.rootConfig,
        database: coreServices.database,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({
        auth,
        catalog,
        config,
        database,
        discovery,
        httpAuth,
        httpRouter,
        logger,
        scheduler,
      }) {
        const settings = readCodeHealthSettings(config);
        const store = await KnexCodeHealthStore.create({ database });
        const integrations = ScmIntegrations.fromConfig(config);

        httpRouter.use(
          createCodeHealthRouter({
            store,
            httpAuth,
            scheduler,
            repositories: new ListRepositorySummaries(store),
            contributors: new ListContributorSummaries(store),
            timeSeries: new GetRepositoryTimeSeries(store),
            refreshableTaskIds: [DISCOVERY_TASK_ID, INGESTION_TASK_ID, SNAPSHOT_TASK_ID],
          }),
        );
        // The frontend probes this before it renders anything, and a probe that
        // needed a token could not distinguish "not installed" from "not
        // signed in".
        httpRouter.addAuthPolicy({ path: "/health", allow: "unauthenticated" });

        const discover = new DiscoverRepositories({
          store,
          catalog: new BackstageCatalogReader(catalog, auth),
          resolver: new AnnotationRepositoryResolver(integrations),
          logger: logger.child({ task: DISCOVERY_TASK_ID }),
        });

        await scheduler.scheduleTask({
          ...settings.ingestion.discoverySchedule,
          id: DISCOVERY_TASK_ID,
          fn: async () => {
            await discover.run({
              entityFilters: settings.ingestion.entityFilters,
              retentionDays: settings.ingestion.retentionDays,
              now: new Date(),
            });
          },
        });

        const gateway = new ProviderGateway({
          logger: logger.child({ component: "provider-gateway" }),
          concurrencyPerHost: settings.ingestion.concurrencyPerHost,
        });
        const credentials = new IntegrationsCredentialsResolver(integrations);

        // A map rather than a switch, so supporting another platform is a new
        // entry and an implementation of the port, with nothing here to edit.
        const collectors = new Map<Platform, VcsCollector>([
          ["github", new GithubCollector({ gateway, credentials, logger })],
          ["azure-devops", new AzureDevOpsCollector({ gateway, credentials, logger })],
        ]);

        const ingest = new IngestRepositoryHistory({
          store,
          collectors,
          settings: settings.ingestion,
          logger: logger.child({ task: INGESTION_TASK_ID }),
        });

        const snapshots = new CaptureRepositorySnapshots({
          store,
          collectors,
          sonar: settings.sonar.enabled
            ? new SonarqubeEnricher({ gateway, auth, discovery, logger })
            : null,
          wakaTime: settings.wakaTime.apiKey
            ? new WakaTimeApiEnricher({ gateway, settings: settings.wakaTime, logger })
            : null,
          settings: settings.ingestion,
          logger: logger.child({ task: SNAPSHOT_TASK_ID }),
        });

        await scheduler.scheduleTask({
          ...settings.ingestion.snapshotSchedule,
          id: SNAPSHOT_TASK_ID,
          fn: async (signal) => {
            await snapshots.run({ now: new Date(), signal });
          },
        });

        await scheduler.scheduleTask({
          ...settings.ingestion.schedule,
          id: INGESTION_TASK_ID,
          // The scheduler aborts on timeout; the signal is threaded all the way
          // to the transport so an overrunning run stops issuing requests
          // instead of finishing them after it was told to stop.
          fn: async (signal) => {
            await ingest.run({ now: new Date(), signal });
          },
        });
      },
    });
  },
});
