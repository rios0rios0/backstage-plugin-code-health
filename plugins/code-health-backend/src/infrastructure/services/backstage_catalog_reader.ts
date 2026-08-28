import type { AuthService } from "@backstage/backend-plugin-api";
import type { Entity } from "@backstage/catalog-model";
import type { CatalogService } from "@backstage/plugin-catalog-node";
import type { DirectoryUser } from "@rios0rios0/backstage-plugin-code-health-common";
import type { EntityFilter } from "../../domain/entities/ingestion_settings";
import type { CatalogReader, CatalogUser } from "../../domain/services/catalog_reader";
import type { DirectoryReader } from "../../domain/services/identity_resolver";

/**
 * Only the fields discovery actually reads. Asking the catalog for the whole
 * entity is the usual performance mistake in a plugin that scans everything.
 */
const REQUIRED_FIELDS = [
  "kind",
  "metadata.name",
  "metadata.namespace",
  "metadata.annotations",
  // Read by the documentation metric: an entity linking out to a wiki counts as
  // documented somewhere, even with no TechDocs annotation.
  "metadata.links",
  "spec.owner",
  // Both feed the API-exposure metric: what the component is, and whether it
  // already tells the catalog which APIs it serves.
  "spec.type",
  "spec.providesApis",
];

/** Discovery never reads a profile, so the user lookup asks for its own fields. */
const USER_FIELDS = ["kind", "metadata.name", "metadata.namespace", "spec.profile"];

/** Azure DevOps reports commit authors by e-mail; GitHub reports a login. */
const isEmail = (value: string): boolean => value.includes("@");

/**
 * How many users the directory listing will pull.
 *
 * Enumerating a directory is the one thing this plugin's design otherwise
 * refuses to do, and it is allowed here only because the Identities screen is a
 * person deliberately asking for the list. The cap keeps a hundred-thousand-seat
 * tenant from turning that request into an outage; when it bites, the screen
 * says the suggestions are drawn from a subset rather than pretending it
 * searched everybody.
 */
export const MAX_DIRECTORY_USERS = 5000;

const toDirectoryUser = (entity: Entity): DirectoryUser => {
  const profile = (entity.spec as { profile?: Record<string, unknown> } | undefined)?.profile;
  const namespace = entity.metadata.namespace ?? "default";

  return {
    entityRef: `user:${namespace}/${entity.metadata.name}`,
    displayName:
      typeof profile?.displayName === "string" ? profile.displayName : entity.metadata.name,
    email: typeof profile?.email === "string" ? profile.email.toLowerCase() : null,
    picture: typeof profile?.picture === "string" ? profile.picture : null,
  };
};

export class BackstageCatalogReader implements CatalogReader, DirectoryReader {
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

  async listUsers(): Promise<DirectoryUser[]> {
    const credentials = await this.auth.getOwnServiceCredentials();
    const { items } = await this.catalog.getEntities(
      { filter: { kind: "User" }, fields: USER_FIELDS, limit: MAX_DIRECTORY_USERS },
      { credentials },
    );

    return items.map(toDirectoryUser);
  }

  async getUsersByRef(entityRefs: readonly string[]): Promise<Map<string, DirectoryUser>> {
    const wanted = [...new Set(entityRefs)];
    if (wanted.length === 0) return new Map();

    const credentials = await this.auth.getOwnServiceCredentials();
    // `getEntitiesByRefs` rather than a filter: a reference is exactly what the
    // link table stores, and asking by name would re-parse it into a filter the
    // catalog then has to turn back into the same lookup.
    const { items } = await this.catalog.getEntitiesByRefs(
      { entityRefs: wanted, fields: USER_FIELDS },
      { credentials },
    );

    const found = new Map<string, DirectoryUser>();
    for (const [index, item] of items.entries()) {
      // `getEntitiesByRefs` answers positionally and returns undefined for a
      // reference the catalog does not hold, which is the normal case for
      // somebody who has left the organisation since the link was made.
      const ref = wanted[index];
      if (item === undefined || ref === undefined) continue;
      found.set(ref, toDirectoryUser(item));
    }
    return found;
  }
}
