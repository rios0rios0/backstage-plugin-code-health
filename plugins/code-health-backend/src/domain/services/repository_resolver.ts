import type { Entity } from "@backstage/catalog-model";
import type { DiscoveredRepository } from "../entities/tracked_repository";

/**
 * Turns a catalog entity into a repository the plugin can ingest, or null when
 * the entity does not name one this plugin supports.
 */
export interface RepositoryResolver {
  resolve(entity: Entity): DiscoveredRepository | null;
}
