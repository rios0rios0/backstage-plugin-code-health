import type { AuthService } from "@backstage/backend-plugin-api";
import type { Entity } from "@backstage/catalog-model";
import type { CatalogService } from "@backstage/plugin-catalog-node";
import type { EntityFilter } from "../../domain/entities/ingestion_settings";
import type { CatalogReader } from "../../domain/services/catalog_reader";

/**
 * Only the fields discovery actually reads. Asking the catalog for the whole
 * entity is the usual performance mistake in a plugin that scans everything.
 */
const REQUIRED_FIELDS = [
  "kind",
  "metadata.name",
  "metadata.namespace",
  "metadata.annotations",
  "spec.owner",
];

export class BackstageCatalogReader implements CatalogReader {
  constructor(
    private readonly catalog: CatalogService,
    private readonly auth: AuthService,
  ) {}

  async listEntities(filters: readonly EntityFilter[]): Promise<Entity[]> {
    // A background task has no incoming request to act on behalf of, so it
    // authenticates as the plugin itself.
    const credentials = await this.auth.getOwnServiceCredentials();

    const { items } = await this.catalog.getEntities(
      { filter: [...filters], fields: REQUIRED_FIELDS },
      { credentials },
    );

    return items;
  }
}
