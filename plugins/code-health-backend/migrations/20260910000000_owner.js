// @ts-check

/**
 * The catalog owner of a repository, as a full entity reference.
 *
 * It lives on the repository row beside the other catalog facts for the same
 * reason they do: `spec.owner` is a state of the catalog entry rather than of
 * the repository, so it changes when somebody edits a YAML file and not on the
 * daily snapshot's schedule. Discovery writes it and nothing else does.
 *
 * Nullable rather than defaulted, because "the entity declares no owner" is a
 * real answer the ownership screen has to be able to give — an empty string
 * would read as an owner nobody can find. Rows written before this migration
 * report null until the next discovery pass refreshes them.
 *
 * Only an added column: adding is portable across the in-memory better-sqlite3
 * database a default Backstage install uses and the PostgreSQL a production one
 * uses, whereas altering an existing column is not.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.string('owner_ref', 512).nullable();
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.dropColumn('owner_ref');
  });
};
