import type { Entity } from "@backstage/catalog-model";
import type { EntityFilter } from "../entities/ingestion_settings";

/**
 * Reads the entities the plugin should track.
 *
 * Narrowed to exactly what discovery needs, so the discovery command can be
 * unit-tested against a hand-rolled in-memory implementation instead of a
 * catalog client and a credentials service.
 */
export interface CatalogReader {
  listEntities(filters: readonly EntityFilter[]): Promise<Entity[]>;
}
