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
 * Decides which of two entities naming one repository owns it.
 *
 * Stability is the whole point. `TrackedRepository.id` is derived from the
 * entity reference, and `syncRepositories` keys on that id alone, so every time
 * the winner changes the repository is inserted as a new row and the old one is
 * soft-deleted — resetting the backfill cursor and dropping the history already
 * ingested out of the dashboard.
 *
 * So the entity already tracking the repository wins, whatever its reference:
 * adding a component later must not take the repository away from the one that
 * has been ingesting it. Only when none of the candidates is the incumbent —
 * a first discovery, or the incumbent leaving the catalog — does the lowest
 * reference win, which keeps the choice independent of the order
 * `CatalogReader.listEntities` returned them in (`CatalogApi.getEntities`
 * guarantees none).
 */
const outranks = (
  candidate: DiscoveredRepository,
  winner: DiscoveredRepository,
  incumbentEntityRef: string | undefined,
): boolean => {
  if (incumbentEntityRef !== undefined) {
    if (candidate.entityRef === incumbentEntityRef) return true;
    if (winner.entityRef === incumbentEntityRef) return false;
  }
  return candidate.entityRef < winner.entityRef;
};

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

    // Which entity already owns each repository. Consulted so an entity added
    // later never takes a repository away from the one already tracking it —
    // see `electWinner`.
    const incumbents = new Map<string, string>();
    for (const { repository } of await store.listTrackedRepositories()) {
      incumbents.set(repositoryIdentity(repository), repository.entityRef);
    }

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

      if (winner && !outranks(repository, winner, incumbents.get(identity))) continue;
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
        collapsed === 1
          ? "collapsed 1 entity onto a repository already named by another entity"
          : `collapsed ${collapsed} entities onto repositories already named by another entity`,
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
