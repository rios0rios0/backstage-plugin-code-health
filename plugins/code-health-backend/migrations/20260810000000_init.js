// @ts-check

/**
 * Initial schema for the Code Health backend.
 *
 * Only portable Knex builders are used — no `jsonb`, no `alterTable().alter()`,
 * no `specificType` — so the same migration runs on the in-memory better-sqlite3
 * database a default Backstage install uses and on the PostgreSQL a production
 * one uses. JSON payloads are stored as `text` and parsed in the store.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('code_health_repositories', table => {
    table.string('id', 255).primary();
    table.string('entity_ref', 512).notNullable().unique();
    table.string('provider', 32).notNullable();
    table.string('host', 255).notNullable();
    table.string('owner', 255).notNullable();
    table.string('project', 255).nullable();
    table.string('name', 255).notNullable();
    table.text('repo_url').notNullable();
    table.string('default_branch', 255).nullable();
    table.string('external_id', 255).nullable();
    table.string('sonar_project_key', 512).nullable();
    table.boolean('archived').notNullable().defaultTo(false);
    table.datetime('discovered_at').notNullable();
    table.datetime('last_seen_at').notNullable();
    // Soft delete: an entity removed from the catalog stops being ingested but
    // keeps its history, so re-adding it later does not restart the backfill.
    table.datetime('removed_at').nullable();

    table.index(['provider'], 'code_health_repositories_provider_idx');
    table.index(['removed_at'], 'code_health_repositories_removed_at_idx');
  });

  await knex.schema.createTable('code_health_ingestion_state', table => {
    table
      .string('repository_id', 255)
      .primary()
      .references('id')
      .inTable('code_health_repositories')
      .onDelete('CASCADE');
    // Oldest day the backfill is walking towards.
    table.date('backfill_floor').notNullable();
    // Next day boundary to fetch, walking backwards from today.
    table.date('backfill_cursor').notNullable();
    // Newest instant already ingested, advanced by the incremental phase.
    table.datetime('incremental_through').notNullable();
    table.string('status', 32).notNullable();
    table.integer('failure_count').notNullable().defaultTo(0);
    table.text('last_error').nullable();
    table.datetime('last_attempt_at').nullable();

    table.index(
      ['status', 'backfill_cursor'],
      'code_health_ingestion_state_status_cursor_idx',
    );
    table.index(
      ['incremental_through'],
      'code_health_ingestion_state_incremental_idx',
    );
  });

  await knex.schema.createTable('code_health_events', table => {
    // `${repositoryId}:${kind}:${externalId}`, so re-ingesting a window that
    // was already fetched updates rows in place instead of duplicating them.
    table.string('id', 512).primary();
    table
      .string('repository_id', 255)
      .notNullable()
      .references('id')
      .inTable('code_health_repositories')
      .onDelete('CASCADE');
    table.string('kind', 32).notNullable();
    table.string('external_id', 255).notNullable();
    table.datetime('occurred_at').notNullable();
    // Normalised author identity: the commit author e-mail lowercased on Azure
    // DevOps, the login on GitHub.
    table.string('actor_key', 255).nullable();
    table.string('actor_name', 255).nullable();
    table.text('actor_avatar_url').nullable();
    table.string('outcome', 32).nullable();
    table.integer('additions').nullable();
    table.integer('deletions').nullable();
    table.integer('changed_files').nullable();
    table.text('payload').nullable();

    table.index(
      ['repository_id', 'occurred_at'],
      'code_health_events_repo_time_idx',
    );
    table.index(
      ['repository_id', 'kind', 'occurred_at'],
      'code_health_events_repo_kind_time_idx',
    );
    table.index(['kind', 'occurred_at'], 'code_health_events_kind_time_idx');
    table.index(
      ['actor_key', 'occurred_at'],
      'code_health_events_actor_time_idx',
    );
  });

  await knex.schema.createTable('code_health_ingested_chunks', table => {
    table
      .string('repository_id', 255)
      .notNullable()
      .references('id')
      .inTable('code_health_repositories')
      .onDelete('CASCADE');
    table.string('kind', 32).notNullable();
    table.date('day').notNullable();
    table.datetime('ingested_at').notNullable();

    // A row exists for every day that was actually fetched, including days that
    // produced no events at all. Without that distinction "no data" and "not
    // fetched yet" are indistinguishable, and the dashboard cannot tell the
    // user which range it is able to answer for.
    table.primary(['repository_id', 'kind', 'day']);
    table.index(['day'], 'code_health_ingested_chunks_day_idx');
  });

  await knex.schema.createTable('code_health_contributor_metrics', table => {
    table.date('day').notNullable();
    // Normalised contributor identity, the same key commit events carry, so the
    // two can be joined without an identity mapping table.
    table.string('contributor_key', 255).notNullable();
    table.datetime('captured_at').notNullable();
    table.text('payload').notNullable();

    table.primary(['day', 'contributor_key']);
    table.index(['day'], 'code_health_contributor_metrics_day_idx');
  });

  await knex.schema.createTable('code_health_snapshots', table => {
    table
      .string('repository_id', 255)
      .notNullable()
      .references('id')
      .inTable('code_health_repositories')
      .onDelete('CASCADE');
    table.date('day').notNullable();
    table.datetime('captured_at').notNullable();
    table.text('payload').notNullable();

    table.primary(['repository_id', 'day']);
    table.index(['day'], 'code_health_snapshots_day_idx');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('code_health_snapshots');
  await knex.schema.dropTableIfExists('code_health_contributor_metrics');
  await knex.schema.dropTableIfExists('code_health_ingested_chunks');
  await knex.schema.dropTableIfExists('code_health_events');
  await knex.schema.dropTableIfExists('code_health_ingestion_state');
  await knex.schema.dropTableIfExists('code_health_repositories');
};
