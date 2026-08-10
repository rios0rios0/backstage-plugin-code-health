import type { LoggerService } from "@backstage/backend-plugin-api";
import type { EntityFilter } from "../entities/ingestion_settings";
import type { DiscoveredRepository } from "../entities/tracked_repository";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { CatalogReader } from "../services/catalog_reader";
import type { RepositoryResolver } from "../services/repository_resolver";

export interface DiscoverRepositoriesResult {
  readonly scanned: number;
  readonly resolved: number;
  readonly inserted: number;
  readonly updated: number;
  readonly removed: number;
}

/**
 * Reconciles the tracked repository set with the Backstage catalog.
 *
 * The catalog is the only source of repositories the plugin ingests. That is
 * the whole point of the design: an organisation's repository list already
 * lives there, so the plugin never enumerates one from a provider API and never
 * pays the per-load cost of doing so.
 */
export class DiscoverRepositories {
  constructor(
    private readonly options: {
      readonly store: CodeHealthStore;
      readonly catalog: CatalogReader;
      readonly resolver: RepositoryResolver;
      readonly logger: LoggerService;
    },
  ) {}

  async run(input: {
    entityFilters: readonly EntityFilter[];
    retentionDays: number;
    now: Date;
  }): Promise<DiscoverRepositoriesResult> {
    const { store, catalog, resolver, logger } = this.options;

    const entities = await catalog.listEntities(input.entityFilters);

    const resolved: DiscoveredRepository[] = [];
    const seen = new Set<string>();

    for (const entity of entities) {
      const repository = resolver.resolve(entity);
      if (!repository) continue;
      // Two entities can name the same repository; the first one wins so the
      // stored entity reference stays stable rather than flapping between them.
      if (seen.has(repository.id)) continue;
      seen.add(repository.id);
      resolved.push(repository);
    }

    const skipped = entities.length - resolved.length;
    if (skipped > 0) {
      logger.debug(
        `skipped ${skipped} of ${entities.length} entities that name no supported repository`,
      );
    }

    const { inserted, updated, removed } = await store.syncRepositories({
      discovered: resolved,
      retentionDays: input.retentionDays,
      now: input.now,
    });

    logger.info(
      `discovered ${resolved.length} repositories from ${entities.length} entities ` +
        `(${inserted.length} new, ${updated.length} refreshed, ${removed.length} no longer in the catalog)`,
    );

    return {
      scanned: entities.length,
      resolved: resolved.length,
      inserted: inserted.length,
      updated: updated.length,
      removed: removed.length,
    };
  }
}
