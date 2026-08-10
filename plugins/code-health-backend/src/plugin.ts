import { coreServices, createBackendPlugin } from "@backstage/backend-plugin-api";
import { ScmIntegrations } from "@backstage/integration";
import { catalogServiceRef } from "@backstage/plugin-catalog-node";
import { CODE_HEALTH_PLUGIN_ID } from "@rios0rios0/backstage-plugin-code-health-common";
import { DiscoverRepositories } from "./domain/commands/discover_repositories";
import { createCodeHealthRouter } from "./infrastructure/controllers/code_health_router";
import { KnexCodeHealthStore } from "./infrastructure/repositories/knex_code_health_store";
import { AnnotationRepositoryResolver } from "./infrastructure/services/annotation_repository_resolver";
import { BackstageCatalogReader } from "./infrastructure/services/backstage_catalog_reader";
import { readCodeHealthSettings } from "./infrastructure/services/backstage_settings_reader";

export const DISCOVERY_TASK_ID = "code-health.discover";

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
        config: coreServices.rootConfig,
        database: coreServices.database,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ auth, catalog, config, database, httpAuth, httpRouter, logger, scheduler }) {
        const settings = readCodeHealthSettings(config);
        const store = await KnexCodeHealthStore.create({ database });
        const integrations = ScmIntegrations.fromConfig(config);

        httpRouter.use(createCodeHealthRouter({ store, httpAuth }));
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
      },
    });
  },
});
