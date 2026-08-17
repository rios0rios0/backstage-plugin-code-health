import type { AuthService } from "@backstage/backend-plugin-api";
import type { Entity } from "@backstage/catalog-model";
import type { CatalogService } from "@backstage/plugin-catalog-node";
import type { EntityFilter } from "../../domain/entities/ingestion_settings";
import type { CatalogReader, CatalogUser } from "../../domain/services/catalog_reader";

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

/** Discovery never reads a profile, so the user lookup asks for its own fields. */
const USER_FIELDS = ["kind", "metadata.name", "metadata.namespace", "spec.profile"];

/** Azure DevOps reports commit authors by e-mail; GitHub reports a login. */
const isEmail = (value: string): boolean => value.includes("@");

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

  async findUsersByEmail(emails: readonly string[]): Promise<Map<string, CatalogUser>> {
    // Lowercased because that is what the catalog's search index holds, and the
    // index is what `filter` queries — an entity whose body spells the address
    // in mixed case is still found this way.
    const wanted = [...new Set(emails.filter(isEmail).map((email) => email.toLowerCase()))];
    if (wanted.length === 0) return new Map();

    const credentials = await this.auth.getOwnServiceCredentials();
    const { items } = await this.catalog.getEntities(
      { filter: { kind: "User", "spec.profile.email": wanted }, fields: USER_FIELDS },
      { credentials },
    );

    const found = new Map<string, CatalogUser>();
    for (const item of items) {
      const profile = (item.spec as { profile?: Record<string, unknown> } | undefined)?.profile;
      const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : undefined;
      if (email === undefined) continue;
      const namespace = item.metadata.namespace ?? "default";
      found.set(email, {
        entityRef: `user:${namespace}/${item.metadata.name}`,
        displayName: typeof profile?.displayName === "string" ? profile.displayName : null,
        picture: typeof profile?.picture === "string" ? profile.picture : null,
      });
    }
    return found;
  }
}
