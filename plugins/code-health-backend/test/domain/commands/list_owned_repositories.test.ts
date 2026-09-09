import { ListOwnedRepositories } from "../../../src/domain/commands/list_owned_repositories";
import { ListRepositorySummaries } from "../../../src/domain/commands/list_repository_summaries";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { StubCatalogReader } from "../../doubles/stub_catalog_reader";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const WINDOW = {
  from: new Date("2026-08-09T00:00:00.000Z"),
  to: new Date("2026-08-11T00:00:00.000Z"),
};

const JANE = "user:default/jane";

const seed = async (owners: Array<{ name: string; ownerRef: string | null }>) => {
  const store = new InMemoryCodeHealthStore();
  await store.syncRepositories({
    discovered: owners.map((owner) =>
      DiscoveredRepositoryBuilder.create()
        .withEntityRef(`component:default/${owner.name}`)
        .withName(owner.name)
        .withOwner(owner.ownerRef)
        .build(),
    ),
    retentionDays: 365,
    now: NOW,
  });
  return store;
};

const commandFor = (store: InMemoryCodeHealthStore, catalog: StubCatalogReader) =>
  new ListOwnedRepositories(new ListRepositorySummaries(store), catalog);

describe("ListOwnedRepositories", () => {
  it("should return the repositories owned by a group the person belongs to", async () => {
    // given
    const store = await seed([
      { name: "gateway", ownerRef: "group:default/platform" },
      { name: "ledger", ownerRef: "group:default/payments" },
    ]);
    const catalog = new StubCatalogReader().withMemberships(JANE, [
      "group:default/platform",
    ]);

    // when
    const result = await commandFor(store, catalog).run({ key: JANE, ...WINDOW });

    // then
    expect(result.items.map((item) => item.name)).toEqual(["gateway"]);
    expect(result.ownership).toEqual({
      entityRef: JANE,
      owners: [JANE, "group:default/platform"],
    });
  });

  it("should return a repository owned by the person themselves", async () => {
    // given
    // `spec.owner: user:default/jane` is a shape the catalog accepts, and the
    // ownership expansion always includes the user's own reference.
    const store = await seed([{ name: "sandbox", ownerRef: JANE }]);
    const catalog = new StubCatalogReader().withMemberships(JANE, []);

    // when
    const result = await commandFor(store, catalog).run({ key: JANE, ...WINDOW });

    // then
    expect(result.items.map((item) => item.name)).toEqual(["sandbox"]);
  });

  it("should match an owner that differs only in case", async () => {
    // given
    // The catalog folds the kind and namespace but keeps the name as it was
    // typed, so one group can legitimately reach here spelled two ways.
    const store = await seed([{ name: "gateway", ownerRef: "group:default/Platform" }]);
    const catalog = new StubCatalogReader().withMemberships(JANE, [
      "group:default/platform",
    ]);

    // when
    const result = await commandFor(store, catalog).run({ key: JANE, ...WINDOW });

    // then
    expect(result.items.map((item) => item.name)).toEqual(["gateway"]);
  });

  it("should sort the rows by name", async () => {
    // given
    const store = await seed([
      { name: "zephyr", ownerRef: "group:default/platform" },
      { name: "alpha", ownerRef: "group:default/platform" },
    ]);
    const catalog = new StubCatalogReader().withMemberships(JANE, [
      "group:default/platform",
    ]);

    // when
    const result = await commandFor(store, catalog).run({ key: JANE, ...WINDOW });

    // then
    expect(result.items.map((item) => item.name)).toEqual(["alpha", "zephyr"]);
  });

  it("should skip a repository whose entity declares no owner", async () => {
    // given
    const store = await seed([{ name: "orphan", ownerRef: null }]);
    const catalog = new StubCatalogReader().withMemberships(JANE, [
      "group:default/platform",
    ]);

    // when
    const result = await commandFor(store, catalog).run({ key: JANE, ...WINDOW });

    // then
    expect(result.items).toEqual([]);
  });

  it("should own nothing for a row nobody has linked to a catalog user", async () => {
    // given
    // Ownership is a fact about the catalog, and an unlinked account has no
    // entity there to own anything with. The empty `owners` is what lets the
    // screen say "not linked yet" rather than "owns nothing".
    const store = await seed([{ name: "gateway", ownerRef: "group:default/platform" }]);
    const catalog = new StubCatalogReader();

    // when
    const result = await commandFor(store, catalog).run({
      key: "vcs:jane@acme.com",
      ...WINDOW,
    });

    // then
    expect(result.ownership).toEqual({ entityRef: null, owners: [] });
    expect(result.items).toEqual([]);
    expect(catalog.ownershipLookups).toEqual([]);
  });

  it("should own nothing for a link the catalog no longer holds", async () => {
    // given
    // Somebody who left the organisation after their account was linked.
    const store = await seed([{ name: "gateway", ownerRef: "group:default/platform" }]);
    const catalog = new StubCatalogReader();

    // when
    const result = await commandFor(store, catalog).run({
      key: "user:default/departed",
      ...WINDOW,
    });

    // then
    expect(result.ownership).toEqual({ entityRef: "user:default/departed", owners: [] });
    expect(result.items).toEqual([]);
  });

  it("should carry the window's counters on each row", async () => {
    // given
    // The rows are ordinary summaries, so their health is computed exactly the
    // way the repositories table computes it rather than by a second path.
    const store = await seed([{ name: "gateway", ownerRef: "group:default/platform" }]);
    const catalog = new StubCatalogReader().withMemberships(JANE, [
      "group:default/platform",
    ]);

    // when
    const result = await commandFor(store, catalog).run({ key: JANE, ...WINDOW });

    // then
    expect(result.items[0]).toMatchObject({
      ownerRef: "group:default/platform",
      activity: expect.objectContaining({ commits: 0 }),
    });
  });
});
