import type { LoggerService } from "@backstage/backend-plugin-api";
import type { EntityFilter } from "../entities/ingestion_settings";
import {
  repositoryIdentity,
  type DiscoveredRepository,
} from "../entities/tracked_repository";
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

    const byRepository = new Map<string, DiscoveredRepository>();
    let unresolved = 0;

    for (const entity of entities) {
      const repository = resolver.resolve(entity);
      if (!repository) {
        unresolved += 1;
        continue;
      }

      // Two entities can name the same repository — a monorepo declaring one
      // component per module, or a single location file declaring many. They
      // must collapse to one tracked repository, otherwise the dashboard shows
      // one identical row per entity and every scheduled task re-fetches the
      // same repository once per row.
      //
      // Keyed on the repository's own coordinates rather than on `id`, which is
      // a hash of the entity reference and so is unique per entity by
      // construction; deduplicating on it compares entities to themselves and
      // can only ever collapse an entity duplicated within one pass.
      const identity = repositoryIdentity(repository);
      const winner = byRepository.get(identity);

      // The lowest entity reference wins rather than whichever the catalog
      // happened to return first, because `getEntities` guarantees no order. A
      // winner that flapped between passes would change the stored row's `id`,
      // and `syncRepositories` would insert a new row and soft-delete the old
      // one — resetting the backfill cursor and discarding every day already
      // ingested for that repository.
      if (winner && winner.entityRef <= repository.entityRef) continue;
      byRepository.set(identity, repository);
    }

    const resolved: DiscoveredRepository[] = [...byRepository.values()];

    if (unresolved > 0) {
      logger.debug(
        `skipped ${unresolved} of ${entities.length} entities that name no supported repository`,
      );
    }

    const collapsed = entities.length - unresolved - resolved.length;
    if (collapsed > 0) {
      // Logged because the alternative symptom is a dashboard with repeated
      // rows and nothing anywhere explaining why.
      logger.info(
        `collapsed ${collapsed} entities onto repositories already named by another entity`,
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
