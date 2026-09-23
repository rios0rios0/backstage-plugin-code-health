// @ts-check

/**
 * How the productivity score is read: which role each person has, and the
 * weights each role is scored on.
 *
 * Two tables because they answer two different questions and are written by
 * two different screens. A role is a statement about a person, recorded under
 * the key their contributor row carries at the time — a catalog reference for
 * somebody linked, `<source>:<sourceKey>` for an account nobody has linked yet
 * — and resolved through the person directory on read, so a role assigned to
 * an account before it was linked follows it onto the linked row. The weights
 * are a statement about the whole install, one row per role, and a role with
 * no row is scored on the defaults the common package ships.
 *
 * Both are applied when a row is built, never baked into what was collected:
 * changing a person's role or a role's weights re-reads every window the plugin
 * has ever collected through the new numbers, exactly as a link or an
 * exclusion does.
 *
 * The weights travel as one JSON payload per role rather than one row per
 * component, because a set is only meaningful whole — the parser refuses a
 * partial one — and a row per component would let two writers leave a role
 * half updated.
 *
 * Only portable Knex builders are used, so the same migration runs on the
 * better-sqlite3 database a default Backstage install uses and on the
 * PostgreSQL a production one uses.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('code_health_contributor_roles', table => {
    // The person key of the contributor row, as the read API keys it.
    table.string('person_key', 512).notNullable();
    // `engineer` or `lead`, the two the wire contract names.
    table.string('role', 32).notNullable();
    table.string('assigned_by', 512).nullable();
    table.datetime('assigned_at').notNullable();

    table.primary(['person_key']);
  });

  await knex.schema.createTable('code_health_productivity_weights', table => {
    table.string('role', 32).notNullable();
    // The whole set for the role, every component named, as JSON.
    table.text('payload').notNullable();
    table.string('updated_by', 512).nullable();
    table.datetime('updated_at').notNullable();

    table.primary(['role']);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('code_health_productivity_weights');
  await knex.schema.dropTableIfExists('code_health_contributor_roles');
};
