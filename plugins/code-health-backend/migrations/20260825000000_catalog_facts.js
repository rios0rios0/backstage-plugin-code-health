// @ts-check

/**
 * Catalog-derived facts the documentation and API-exposure metrics read.
 *
 * These come from the entity itself rather than from the provider, so discovery
 * writes them and nothing else does. They live on the repository row instead of
 * in the daily snapshot because they are not a state of the repository — they
 * are a state of its catalog entry, and it changes when somebody edits a YAML
 * file, not on the snapshot's schedule.
 *
 * Only added columns, with defaults: adding is portable across the in-memory
 * better-sqlite3 database a default Backstage install uses and the PostgreSQL a
 * production one uses, whereas altering an existing column is not.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.string('entity_kind', 64).nullable();
    table.string('entity_type', 64).nullable();
    table.string('techdocs_ref', 512).nullable();
    table.integer('provides_apis').notNullable().defaultTo(0);
    table.boolean('has_external_docs').notNullable().defaultTo(false);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.dropColumn('has_external_docs');
    table.dropColumn('provides_apis');
    table.dropColumn('techdocs_ref');
    table.dropColumn('entity_type');
    table.dropColumn('entity_kind');
  });
};
