import { resolvePackagePath } from "@backstage/backend-plugin-api";
import { TestDatabases } from "@backstage/backend-test-utils";
import type { Knex } from "knex";

/**
 * The declaration column runs against a real database, like the store: what a
 * row written before it reads as is a question about SQL, and a double would
 * agree with whatever the migration happened to do.
 */
const databases = TestDatabases.create({ ids: ["SQLITE_3"], disableDocker: true });

const MIGRATIONS_DIR = resolvePackagePath(
  "@rios0rios0/backstage-plugin-code-health-backend",
  "migrations",
);

const DECLARATION_MIGRATION = "20261116000000_declares_no_api.js";

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

describe("20261116000000_declares_no_api", () => {
  let knex: Knex;

  beforeEach(async () => {
    knex = await databases.init("SQLITE_3");
    await migrateUpTo(knex, DECLARATION_MIGRATION);
    await knex("code_health_repositories").insert({
      id: "gateway",
      entity_ref: "component:default/gateway",
      provider: "github",
      host: "github.com",
      owner: "example-org",
      name: "gateway",
      repo_url: "https://github.com/example-org/gateway",
      archived: false,
      discovered_at: NOW,
      last_seen_at: NOW,
    });
  });

  it("should read a repository stored before it as declaring nothing", async () => {
    // given / when
    await knex.migrate.up({ directory: MIGRATIONS_DIR });

    // then
    // Nobody read the annotation when the row was written, which grades the
    // same as an entity that carries none. SQLite answers a boolean as 0 and
    // PostgreSQL as false; either way it is not null.
    const row = await knex("code_health_repositories").where({ id: "gateway" }).first();
    expect([0, false]).toContain(row.declares_no_api);
  });

  it("should drop the column again on the way down", async () => {
    // given
    await knex.migrate.up({ directory: MIGRATIONS_DIR });

    // when
    await knex.migrate.down({ directory: MIGRATIONS_DIR });

    // then
    expect(await knex.schema.hasColumn("code_health_repositories", "declares_no_api")).toBe(
      false,
    );
  });
});
