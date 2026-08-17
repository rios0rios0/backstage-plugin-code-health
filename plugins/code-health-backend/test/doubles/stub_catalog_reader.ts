import type { Entity } from "@backstage/catalog-model";
import type { EntityFilter } from "../../src/domain/entities/ingestion_settings";
import type { CatalogReader, CatalogUser } from "../../src/domain/services/catalog_reader";

export class StubCatalogReader implements CatalogReader {
  private entities: Entity[] = [];
  private failure: Error | null = null;

  private users = new Map<string, CatalogUser>();

  /** Filters each call was made with, so tests can assert what was requested. */
  readonly calls: Array<readonly EntityFilter[]> = [];

  /** E-mails each user lookup was made with, for the same reason. */
  readonly emailLookups: Array<readonly string[]> = [];

  withUsers(users: Record<string, CatalogUser>): StubCatalogReader {
    this.users = new Map(Object.entries(users));
    return this;
  }

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

  async findUsersByEmail(emails: readonly string[]): Promise<Map<string, CatalogUser>> {
    this.emailLookups.push(emails);
    if (this.failure) throw this.failure;
    return new Map(
      [...this.users.entries()].filter(([email]) =>
        emails.some((wanted) => wanted.toLowerCase() === email),
      ),
    );
  }
}
