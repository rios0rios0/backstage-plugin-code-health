// @ts-check

/**
 * Whether the catalog entity declares that the component exposes no API of its
 * own, through the `code-health/api-exposure: none` annotation.
 *
 * It lives on the repository row beside the other catalog facts for the same
 * reason they do: an annotation is a state of the catalog entry rather than of
 * the repository, so it changes when somebody edits a YAML file and not on the
 * daily snapshot's schedule. Discovery writes it and nothing else does.
 *
 * Defaulted to false rather than nullable, because a row written before this
 * migration was discovered without anybody reading the annotation, which grades
 * the same as an entity that carries none. Each such row keeps the grade it had
 * until the next discovery pass reads its entity again.
 *
 * Only an added column: adding is portable across the in-memory better-sqlite3
 * database a default Backstage install uses and the PostgreSQL a production one
 * uses, whereas altering an existing column is not.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.boolean('declares_no_api').notNullable().defaultTo(false);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.dropColumn('declares_no_api');
  });
};
