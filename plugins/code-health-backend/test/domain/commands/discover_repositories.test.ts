import { ConfigReader } from "@backstage/config";
import { ScmIntegrations } from "@backstage/integration";
import { DiscoverRepositories } from "../../../src/domain/commands/discover_repositories";
import { AnnotationRepositoryResolver } from "../../../src/infrastructure/services/annotation_repository_resolver";
import { EntityBuilder } from "../../builders/entity_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { RecordingLogger } from "../../doubles/recording_logger";
import { StubCatalogReader } from "../../doubles/stub_catalog_reader";

const NOW = new Date("2026-08-10T12:00:00.000Z");

const resolver = () =>
  new AnnotationRepositoryResolver(
    ScmIntegrations.fromConfig(
      new ConfigReader({
        integrations: {
          github: [{ host: "github.com", token: "fixture-token-placeholder" }],
        },
      }),
    ),
  );

const createCommand = (catalog: StubCatalogReader, store = new InMemoryCodeHealthStore()) => {
  const logger = new RecordingLogger();
  const command = new DiscoverRepositories({ store, catalog, resolver: resolver(), logger });
  return { command, store, logger };
};

const run = (command: DiscoverRepositories) =>
  command.run({ entityFilters: [{ kind: "Component" }], retentionDays: 365, now: NOW });

describe("DiscoverRepositories", () => {
  it("should track every entity that names a supported repository", async () => {
    // given
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withName("a").withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create().withName("b").withGithubSlug("rios0rios0/autobump").build(),
    ]);
    const { command, store } = createCommand(catalog);

    // when
    const result = await run(command);

    // then
    expect(result).toMatchObject({ scanned: 2, resolved: 2, inserted: 2, removed: 0 });
    const tracked = await store.listTrackedRepositories();
    expect(tracked.map((item) => item.repository.name).sort()).toEqual(["autobump", "pipelines"]);
  });

  it("should pass the configured filters straight through to the catalog", async () => {
    // given
    const catalog = new StubCatalogReader().withEntities([]);
    const { command } = createCommand(catalog);

    // when
    await command.run({
      entityFilters: [{ kind: "Component", "spec.type": "service" }],
      retentionDays: 365,
      now: NOW,
    });

    // then
    expect(catalog.calls).toEqual([[{ kind: "Component", "spec.type": "service" }]]);
  });

  it("should skip entities that name no supported repository", async () => {
    // given
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create().build(),
      EntityBuilder.create().withSourceLocation("https://bitbucket.org/team/repo/src/main/").build(),
    ]);
    const { command, logger } = createCommand(catalog);

    // when
    const result = await run(command);

    // then
    expect(result).toMatchObject({ scanned: 3, resolved: 1 });
    expect(logger.at("debug").join(" ")).toContain("skipped 2 of 3 entities");
  });

  it("should track one repository when two distinct entities name it", async () => {
    // given
    // The monorepo case: one repository, one component per module. Letting both
    // through renders an identical dashboard row per entity and makes every
    // scheduled task re-fetch the same repository once per row.
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withName("api").withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create().withName("worker").withGithubSlug("rios0rios0/pipelines").build(),
    ]);
    const { command, store } = createCommand(catalog);

    // when
    const result = await run(command);

    // then
    expect(result).toMatchObject({ scanned: 2, resolved: 1 });
    expect(await store.listTrackedRepositories()).toHaveLength(1);
  });

  it("should track one repository when many entities name it on Azure DevOps", async () => {
    // given
    // The other shape of the same problem: a single location file declaring one
    // component per environment, all resolving to the repository holding it.
    const catalog = new StubCatalogReader().withEntities(
      ["alpha", "beta", "gamma", "delta"].map((name) =>
        EntityBuilder.create()
          .withName(name)
          .withAzureRepo("infrastructure/clusters", "dev.azure.com/acme")
          .build(),
      ),
    );
    const { command, store } = createCommand(catalog);

    // when
    const result = await run(command);

    // then
    expect(result).toMatchObject({ scanned: 4, resolved: 1 });
    expect(await store.listTrackedRepositories()).toHaveLength(1);
  });

  it("should collapse entities that name one repository through different annotations", async () => {
    // given
    // The same repository reached two ways, spelled differently. Both providers
    // treat these segments case-insensitively, so this is one repository.
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withName("a").withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create()
        .withName("b")
        .withSourceLocation("https://github.com/rios0rios0/Pipelines/tree/main/")
        .build(),
    ]);
    const { command, store } = createCommand(catalog);

    // when
    const result = await run(command);

    // then
    expect(result.resolved).toBe(1);
    expect(await store.listTrackedRepositories()).toHaveLength(1);
  });

  it("should report how many entities collapsed onto another entity's repository", async () => {
    // given
    // Without this line the only symptom is a dashboard with repeated rows and
    // nothing anywhere explaining why.
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withName("api").withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create().withName("worker").withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create().withName("other").withGithubSlug("rios0rios0/autobump").build(),
    ]);
    const { command, logger } = createCommand(catalog);

    // when
    await run(command);

    // then
    expect(logger.at("info").join(" ")).toContain(
      "collapsed 1 entities onto repositories already named by another entity",
    );
  });

  it("should keep the same entity when the catalog returns them in another order", async () => {
    // given
    // `getEntities` guarantees no ordering. Because `id` is derived from the
    // entity reference, a winner decided by arrival order would change the row's
    // id between passes, and `syncRepositories` would reinsert it — resetting
    // the backfill cursor and discarding every day already ingested.
    const api = EntityBuilder.create().withName("api").withGithubSlug("rios0rios0/pipelines");
    const worker = EntityBuilder.create().withName("worker").withGithubSlug("rios0rios0/pipelines");
    const store = new InMemoryCodeHealthStore();
    const catalog = new StubCatalogReader().withEntities([api.build(), worker.build()]);
    const { command } = createCommand(catalog, store);
    await run(command);
    const [first] = await store.listTrackedRepositories();

    // when
    catalog.withEntities([worker.build(), api.build()]);
    const result = await run(command);

    // then
    const [second] = await store.listTrackedRepositories();
    expect(second?.repository.entityRef).toBe(first?.repository.entityRef);
    expect(result).toMatchObject({ inserted: 0, updated: 1, removed: 0 });
  });

  it("should stop tracking a repository whose entity left the catalog", async () => {
    // given
    const kept = EntityBuilder.create().withName("kept").withGithubSlug("rios0rios0/a").build();
    const dropped = EntityBuilder.create()
      .withName("dropped")
      .withGithubSlug("rios0rios0/b")
      .build();
    const catalog = new StubCatalogReader().withEntities([kept, dropped]);
    const { command, store } = createCommand(catalog);
    await run(command);

    // when
    catalog.withEntities([kept]);
    const result = await run(command);

    // then
    expect(result.removed).toBe(1);
    const tracked = await store.listTrackedRepositories();
    expect(tracked.map((item) => item.repository.name)).toEqual(["a"]);
  });

  it("should refresh rather than reinsert on a second pass", async () => {
    // given
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withName("a").withGithubSlug("rios0rios0/pipelines").build(),
    ]);
    const { command } = createCommand(catalog);
    await run(command);

    // when
    const result = await run(command);

    // then
    // Reinserting would reset the backfill cursor to today and throw away every
    // day already fetched.
    expect(result).toMatchObject({ inserted: 0, updated: 1 });
  });

  it("should report a summary of what it found", async () => {
    // given
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withGithubSlug("rios0rios0/pipelines").build(),
    ]);
    const { command, logger } = createCommand(catalog);

    // when
    await run(command);

    // then
    expect(logger.at("info").join(" ")).toContain("discovered 1 repositories from 1 entities");
  });

  it("should surface a catalog failure rather than silently tracking nothing", async () => {
    // given
    // Swallowing this would soft-delete every repository the plugin knows about
    // on the next pass, and take their history's usefulness with it.
    const catalog = new StubCatalogReader().withFailure(new Error("catalog unreachable"));
    const { command } = createCommand(catalog);

    // when / then
    await expect(run(command)).rejects.toThrow("catalog unreachable");
  });
});
