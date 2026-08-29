// @ts-check

/**
 * The person directory, and per-integration measures keyed by source.
 *
 * Two things arrive together here because they are the same change. Once more
 * than one system is being measured, a contributor row has to be a *person*
 * rather than an account — commits arrive under a GitHub login, coding time
 * under a WakaTime username, tickets under an Atlassian account id, and none of
 * the three matches the others. `code_health_identities` records every account
 * the plugin has seen and `code_health_identity_links` records which person it
 * belongs to; `code_health_contributor_measures` then stores each integration's
 * numbers against the account that reported them, so re-linking somebody
 * corrects every window already collected instead of only the ones collected
 * afterwards.
 *
 * Only portable Knex builders are used — no `jsonb`, no `alterTable().alter()`
 * — so the same migration runs on the in-memory better-sqlite3 database a
 * default Backstage install uses and on the PostgreSQL a production one uses.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('code_health_identities', table => {
    table.string('source', 32).notNullable();
    // Normalised: trimmed and lowercased. Every one of the four sources treats
    // its own identifier case-insensitively somewhere, and two rows differing
    // only in capitalisation are two people as far as a primary key is
    // concerned.
    table.string('source_key', 320).notNullable();
    table.string('display_name', 255).nullable();
    table.string('email', 320).nullable();
    table.text('avatar_url').nullable();
    table.text('profile_url').nullable();
    table.datetime('first_seen_at').notNullable();
    table.datetime('last_seen_at').notNullable();

    table.primary(['source', 'source_key']);
    table.index(['source'], 'code_health_identities_source_idx');
    table.index(['email'], 'code_health_identities_email_idx');
  });

  await knex.schema.createTable('code_health_identity_links', table => {
    table.string('source', 32).notNullable();
    table.string('source_key', 320).notNullable();
    // Not a foreign key onto `code_health_identities`: a link may be made for an
    // account that has not been observed since the plugin was installed, and
    // losing the link when the row ages out would silently un-merge somebody.
    table.string('entity_ref', 512).notNullable();
    // `manual` or `catalog-email`. A manual link is never overwritten by an
    // automatic one — a scheduled task quietly undoing somebody's correction is
    // the single failure that would make the linking screen pointless.
    table.string('origin', 32).notNullable();
    table.string('linked_by', 512).nullable();
    table.datetime('linked_at').notNullable();

    table.primary(['source', 'source_key']);
    table.index(['entity_ref'], 'code_health_identity_links_entity_idx');
  });

  await knex.schema.createTable('code_health_contributor_measures', table => {
    table.string('source', 32).notNullable();
    table.date('day').notNullable();
    // The account key the source reported, not a person. Resolving it happens
    // on read, so nothing here bakes in a guess about who somebody is.
    table.string('contributor_key', 320).notNullable();
    table.datetime('captured_at').notNullable();
    table.text('payload').notNullable();

    table.primary(['source', 'day', 'contributor_key']);
    table.index(['source', 'day'], 'code_health_contributor_measures_source_day_idx');
    table.index(['contributor_key'], 'code_health_contributor_measures_key_idx');
  });

  // The table this replaces held a rolling 30-day WakaTime summary in a payload
  // shape that no longer exists — two fields where there are now a day series,
  // seven breakdowns and the AI figures. Its rows are dropped rather than
  // copied because carrying them across would put values into the new column
  // that no reader can parse, and the next snapshot pass rebuilds the whole
  // window from WakaTime anyway.
  await knex.schema.dropTableIfExists('code_health_contributor_metrics');

  await knex.schema.alterTable('code_health_repositories', table => {
    // Read by discovery from the catalog entity, alongside the facts the
    // documentation and API metrics already use. They live on the repository
    // row for the same reason those do: they change when somebody edits a YAML
    // file, not on the snapshot's schedule.
    table.string('jira_project_key', 64).nullable();
    table.string('jira_component', 255).nullable();
    table.string('confluence_space_key', 64).nullable();
    table.string('wakatime_project', 255).nullable();
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('code_health_repositories', table => {
    table.dropColumn('wakatime_project');
    table.dropColumn('confluence_space_key');
    table.dropColumn('jira_component');
    table.dropColumn('jira_project_key');
  });

  await knex.schema.dropTableIfExists('code_health_contributor_measures');
  await knex.schema.dropTableIfExists('code_health_identity_links');
  await knex.schema.dropTableIfExists('code_health_identities');

  await knex.schema.createTable('code_health_contributor_metrics', table => {
    table.date('day').notNullable();
    table.string('contributor_key', 255).notNullable();
    table.datetime('captured_at').notNullable();
    table.text('payload').notNullable();

    table.primary(['day', 'contributor_key']);
    table.index(['day'], 'code_health_contributor_metrics_day_idx');
  });
};
