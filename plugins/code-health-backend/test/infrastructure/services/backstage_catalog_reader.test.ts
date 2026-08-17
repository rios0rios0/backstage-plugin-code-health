import type { AuthService } from "@backstage/backend-plugin-api";
import type { Entity } from "@backstage/catalog-model";
import type { CatalogService } from "@backstage/plugin-catalog-node";
import { BackstageCatalogReader } from "../../../src/infrastructure/services/backstage_catalog_reader";

interface RecordedQuery {
  readonly filter: unknown;
  readonly fields: readonly string[] | undefined;
}

/**
 * Hand-rolled stand-in for the catalog client.
 *
 * It answers with whatever entities the test seeded and records the query it
 * was handed, which is the part worth asserting: the filter decides whether a
 * contributor resolves at all.
 */
class StubCatalogService {
  readonly queries: RecordedQuery[] = [];

  constructor(private readonly entities: Entity[] = []) {}

  async getEntities(request: {
    filter?: unknown;
    fields?: readonly string[];
  }): Promise<{ items: Entity[] }> {
    this.queries.push({ filter: request.filter, fields: request.fields });
    return { items: this.entities };
  }

  asCatalogService(): CatalogService {
    return this as unknown as CatalogService;
  }
}

const stubAuth = (): AuthService =>
  ({
    getOwnServiceCredentials: async () => ({}) as never,
  }) as unknown as AuthService;

const aUser = (overrides: {
  name: string;
  namespace?: string;
  email?: unknown;
  displayName?: unknown;
  picture?: unknown;
}): Entity =>
  ({
    apiVersion: "backstage.io/v1alpha1",
    kind: "User",
    metadata: {
      name: overrides.name,
      ...(overrides.namespace === undefined ? {} : { namespace: overrides.namespace }),
    },
    spec: {
      profile: {
        ...(overrides.email === undefined ? {} : { email: overrides.email }),
        ...(overrides.displayName === undefined ? {} : { displayName: overrides.displayName }),
        ...(overrides.picture === undefined ? {} : { picture: overrides.picture }),
      },
    },
  }) as Entity;

const readerFor = (catalog: StubCatalogService) =>
  new BackstageCatalogReader(catalog.asCatalogService(), stubAuth());

describe("BackstageCatalogReader.findUsersByEmail", () => {
  it("should key the result by the lowercased address", async () => {
    // given
    const catalog = new StubCatalogService([
      aUser({
        name: "jane.doe",
        email: "Jane.Doe@example.com",
        displayName: "Jane Doe",
        picture: "https://example.test/jane.png",
      }),
    ]);

    // when
    const found = await readerFor(catalog).findUsersByEmail(["JANE.DOE@EXAMPLE.COM"]);

    // then
    expect(found.get("jane.doe@example.com")).toEqual({
      entityRef: "user:default/jane.doe",
      displayName: "Jane Doe",
      picture: "https://example.test/jane.png",
    });
  });

  it("should query the lowercased addresses, which is what the search index holds", async () => {
    // given
    const catalog = new StubCatalogService([]);

    // when
    await readerFor(catalog).findUsersByEmail(["Jane.Doe@example.com"]);

    // then
    expect(catalog.queries[0].filter).toEqual({
      kind: "User",
      "spec.profile.email": ["jane.doe@example.com"],
    });
  });

  it("should ask only for the fields it reads", async () => {
    // given
    // Requesting whole entities is the usual performance mistake in a plugin
    // that queries the catalog on every dashboard load.
    const catalog = new StubCatalogService([]);

    // when
    await readerFor(catalog).findUsersByEmail(["jane@example.com"]);

    // then
    expect(catalog.queries[0].fields).toEqual([
      "kind",
      "metadata.name",
      "metadata.namespace",
      "spec.profile",
    ]);
  });

  it("should ask for each address once", async () => {
    // given
    // The same person committing under two spellings is one row to look up.
    const catalog = new StubCatalogService([]);

    // when
    await readerFor(catalog).findUsersByEmail([
      "jane@example.com",
      "JANE@example.com",
      "jane@example.com",
    ]);

    // then
    expect(catalog.queries[0].filter).toEqual({
      kind: "User",
      "spec.profile.email": ["jane@example.com"],
    });
  });

  it("should not query at all when no key is an address", async () => {
    // given
    // GitHub reports a login rather than an e-mail, and a login matches nothing
    // here — asking anyway would be a request per dashboard load for no result.
    const catalog = new StubCatalogService([]);

    // when
    const found = await readerFor(catalog).findUsersByEmail(["octocat", "dependabot[bot]"]);

    // then
    expect(found.size).toBe(0);
    expect(catalog.queries).toHaveLength(0);
  });

  it("should keep the entity's own namespace", async () => {
    // given
    const catalog = new StubCatalogService([
      aUser({ name: "jane.doe", namespace: "staff", email: "jane@example.com" }),
    ]);

    // when
    const found = await readerFor(catalog).findUsersByEmail(["jane@example.com"]);

    // then
    expect(found.get("jane@example.com")?.entityRef).toBe("user:staff/jane.doe");
  });

  it("should report a user with no display name or picture as null rather than dropping it", async () => {
    // given
    // The link is still worth having; only the name and avatar are missing.
    const catalog = new StubCatalogService([
      aUser({ name: "jane.doe", email: "jane@example.com" }),
    ]);

    // when
    const found = await readerFor(catalog).findUsersByEmail(["jane@example.com"]);

    // then
    expect(found.get("jane@example.com")).toEqual({
      entityRef: "user:default/jane.doe",
      displayName: null,
      picture: null,
    });
  });

  it("should ignore a profile whose fields are not strings", async () => {
    // given
    // Catalog entities are user-authored YAML, so a profile can hold anything.
    const catalog = new StubCatalogService([
      aUser({
        name: "odd",
        email: "odd@example.com",
        displayName: 42,
        picture: { url: "nope" },
      }),
    ]);

    // when
    const found = await readerFor(catalog).findUsersByEmail(["odd@example.com"]);

    // then
    expect(found.get("odd@example.com")).toEqual({
      entityRef: "user:default/odd",
      displayName: null,
      picture: null,
    });
  });

  it("should skip an entity carrying no address to key on", async () => {
    // given
    const catalog = new StubCatalogService([
      aUser({ name: "no-profile" }),
      aUser({ name: "jane.doe", email: "jane@example.com" }),
    ]);

    // when
    const found = await readerFor(catalog).findUsersByEmail(["jane@example.com"]);

    // then
    expect([...found.keys()]).toEqual(["jane@example.com"]);
  });
});
