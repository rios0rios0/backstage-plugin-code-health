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

  it("should keep the first entity when two name the same repository", async () => {
    // given
    // Two components can point at one repository; letting both through would
    // make the stored entity reference flap on every discovery pass.
    const catalog = new StubCatalogReader().withEntities([
      EntityBuilder.create().withName("first").withGithubSlug("rios0rios0/pipelines").build(),
      EntityBuilder.create().withName("first").withGithubSlug("rios0rios0/pipelines").build(),
    ]);
    const { command, store } = createCommand(catalog);

    // when
    const result = await run(command);

    // then
    expect(result.resolved).toBe(1);
    expect(await store.listTrackedRepositories()).toHaveLength(1);
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
