import type { Entity } from "@backstage/catalog-model";
import type { EntityFilter } from "../../src/domain/entities/ingestion_settings";
import type { CatalogReader } from "../../src/domain/services/catalog_reader";

export class StubCatalogReader implements CatalogReader {
  private entities: Entity[] = [];
  private failure: Error | null = null;

  /** Filters each call was made with, so tests can assert what was requested. */
  readonly calls: Array<readonly EntityFilter[]> = [];

  withEntities(entities: Entity[]): StubCatalogReader {
    this.entities = entities;
    return this;
  }

  withFailure(failure: Error): StubCatalogReader {
    this.failure = failure;
    return this;
  }

  async listEntities(filters: readonly EntityFilter[]): Promise<Entity[]> {
    this.calls.push(filters);
    if (this.failure) throw this.failure;
    return this.entities;
  }
}
