import { resolvePackagePath } from "@backstage/backend-plugin-api";
import { TestDatabases } from "@backstage/backend-test-utils";
import type { Knex } from "knex";

/**
 * The re-walk migration runs against a real database, like the store: what it
 * deletes and what it leaves alone is a question about SQL, and a double would
 * agree with whatever the migration happened to do.
 */
const databases = TestDatabases.create({ ids: ["SQLITE_3"], disableDocker: true });

const MIGRATIONS_DIR = resolvePackagePath(
  "@rios0rios0/backstage-plugin-code-health-backend",
  "migrations",
);

const REATTRIBUTION_MIGRATION = "20260909000000_reattribute_merged_work.js";

const NOW = new Date("2026-08-10T12:00:00.000Z");

/** Applies every migration that precedes the one under test. */
const migrateUpTo = async (knex: Knex, name: string): Promise<void> => {
  const [, pending] = (await knex.migrate.list({ directory: MIGRATIONS_DIR })) as [
    unknown[],
    { file: string }[],
  ];
  for (const migration of pending) {
    if (migration.file === name) return;
    await knex.migrate.up({ directory: MIGRATIONS_DIR });
  }
};

const seed = async (knex: Knex, id: string, removedAt: Date | null): Promise<void> => {
  await knex("code_health_repositories").insert({
    id,
    entity_ref: `component:default/${id}`,
    provider: "github",
    host: "github.com",
    owner: "acme",
    name: id,
    repo_url: `https://github.com/acme/${id}`,
    archived: false,
    discovered_at: NOW,
    last_seen_at: NOW,
    removed_at: removedAt,
  });
  await knex("code_health_ingestion_state").insert({
    repository_id: id,
    backfill_floor: "2025-08-10",
    backfill_cursor: "2025-08-10",
    incremental_through: NOW,
    status: "complete",
    failure_count: 2,
    last_error: "something earlier",
  });
  for (const kind of ["commit", "pull_request", "pr_review", "build", "release", "tag"]) {
    await knex("code_health_events").insert({
      id: `${id}:${kind}:1`,
      repository_id: id,
      kind,
      external_id: "1",
      occurred_at: NOW,
      actor_key: "merger@example.com",
    });
  }
  await knex("code_health_ingested_chunks").insert({
    repository_id: id,
    kind: "commit",
    day: "2026-08-09",
    ingested_at: NOW,
  });
};

describe("20260909000000_reattribute_merged_work", () => {
  let knex: Knex;

  beforeEach(async () => {
    knex = await databases.init("SQLITE_3");
    await migrateUpTo(knex, REATTRIBUTION_MIGRATION);
    await seed(knex, "tracked", null);
    await seed(knex, "gone", NOW);
  });

  it("should send a tracked repository's cursors back to where a fresh install starts", async () => {
    // given / when
    await knex.migrate.up({ directory: MIGRATIONS_DIR });

    // then
    const state = await knex("code_health_ingestion_state")
      .where({ repository_id: "tracked" })
      .first();
    expect(state).toMatchObject({ status: "pending", failure_count: 0, last_error: null });
    // The floor is where the walk is heading, and the cursor is back at today.
    expect(String(state.backfill_floor)).toContain("2025-08-10");
    expect(String(state.backfill_cursor)).not.toContain("2025-08-10");
    expect(new Date(state.incremental_through).getTime()).toBeLessThan(Date.now());
    expect(await knex("code_health_ingested_chunks").where({ repository_id: "tracked" })).toEqual(
      [],
    );
  });

  it("should remove what the walk re-collects and keep what the snapshot observed", async () => {
    // given / when
    await knex.migrate.up({ directory: MIGRATIONS_DIR });

    // then
    // Releases and tags come from the daily snapshot rather than the walk, so
    // nothing would ever put them back.
    const kinds = (
      await knex("code_health_events").where({ repository_id: "tracked" }).select("kind")
    ).map((row: { kind: string }) => row.kind);
    expect(kinds.sort()).toEqual(["release", "tag"]);
  });

  it("should leave a repository that left the catalog untouched", async () => {
    // given / when
    await knex.migrate.up({ directory: MIGRATIONS_DIR });

    // then
    // It is never ingested again, so its history — wrong as it is — is kept
    // rather than deleted with nothing to replace it.
    expect(await knex("code_health_events").where({ repository_id: "gone" })).toHaveLength(6);
    expect(await knex("code_health_ingested_chunks").where({ repository_id: "gone" })).toHaveLength(1);
    expect(
      await knex("code_health_ingestion_state").where({ repository_id: "gone" }).first(),
    ).toMatchObject({ status: "complete", failure_count: 2 });
  });

  it("should have nothing to roll back", async () => {
    // given
    await knex.migrate.up({ directory: MIGRATIONS_DIR });

    // when
    await knex.migrate.down({ directory: MIGRATIONS_DIR });

    // then
    // The rows it removed are re-derived from the provider by the next runs;
    // rolling back leaves the walk where it is rather than inventing history.
    expect(await knex("code_health_events").where({ repository_id: "tracked" })).toHaveLength(2);
  });
});
