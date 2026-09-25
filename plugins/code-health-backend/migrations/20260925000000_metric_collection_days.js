// @ts-check

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('code_health_metric_collection_days', table => {
    table.string('source', 32).notNullable();
    table.date('day').notNullable();
    table.datetime('captured_at').notNullable();
    table.primary(['source', 'day']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('code_health_metric_collection_days');
};
