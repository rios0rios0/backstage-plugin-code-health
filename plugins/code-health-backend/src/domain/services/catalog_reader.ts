import type { Entity } from "@backstage/catalog-model";
import type { EntityFilter } from "../entities/ingestion_settings";

/**
 * Reads the entities the plugin should track.
 *
 * Narrowed to exactly what discovery needs, so the discovery command can be
 * unit-tested against a hand-rolled in-memory implementation instead of a
 * catalog client and a credentials service.
 */
/** The parts of a catalog `User` a contributor row needs. */
export interface CatalogUser {
  readonly entityRef: string;
  readonly displayName: string | null;
  readonly picture: string | null;
}

export interface CatalogReader {
  listEntities(filters: readonly EntityFilter[]): Promise<Entity[]>;

  /**
   * Catalog users whose profile e-mail matches one of `emails`, keyed by the
   * lowercased e-mail.
   *
   * Deliberately a lookup by address rather than "list every user": an
   * organisation's directory is routinely thousands of entities, of which only
   * the handful who committed in the window can ever match, and this runs on
   * every dashboard load.
   */
  findUsersByEmail(emails: readonly string[]): Promise<Map<string, CatalogUser>>;
}
