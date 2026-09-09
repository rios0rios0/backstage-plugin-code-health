// @ts-check

/**
 * Re-walks every tracked repository's history so merged work is credited to
 * whoever did it rather than to whoever merged it.
 *
 * Until this release, the commit a merge produced was stored under the merger
 * — the squash commit Azure DevOps stamps with whoever pressed *Complete*, the
 * merge commit GitHub authors as the merger and loads with the whole pull
 * request's churn — and the pipeline run it triggered was stored under whoever
 * the provider said requested it, which is the same person. The rows already
 * in the table are wrong in exactly the way the fix corrects, and nothing can
 * repair them in place: the facts the fix needs (parent counts, merge commits,
 * built commits) were never stored.
 *
 * So the ingestion cursors of every tracked repository go back to where a
 * fresh install starts, the days they claimed as fetched are forgotten, and
 * the events the walk re-collects are removed so a dropped merge commit or a
 * reviewer's empty vote does not survive as a stale row. Releases and tags
 * come from the daily snapshot rather than the walk, and stay. A repository
 * that has left the catalog is never ingested again, so its history — wrong
 * as it is — is kept rather than deleted with nothing to replace it.
 *
 * The dashboard behaves as it does after installation: the last day is
 * answerable from the first run, and wider ranges unlock as the backfill
 * advances. That is a visible cost, and it is paid once, because these figures
 * are read as a measure of people.
 *
 * Only portable Knex builders are used, so the same migration runs on the
 * in-memory better-sqlite3 database a default Backstage install uses and on
 * the PostgreSQL a production one uses.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const tracked = knex('code_health_repositories').whereNull('removed_at').select('id');

  await knex('code_health_events')
    .whereIn('repository_id', tracked)
    .whereIn('kind', ['commit', 'pull_request', 'pr_review', 'build'])
    .delete();

  await knex('code_health_ingested_chunks').whereIn('repository_id', tracked).delete();

  await knex('code_health_ingestion_state').whereIn('repository_id', tracked).update({
    backfill_cursor: today,
    // A day back, as discovery sets it, so the very first run has a window to
    // fetch and the dashboard can answer for "the last day" immediately.
    incremental_through: yesterday,
    status: 'pending',
    failure_count: 0,
    last_error: null,
  });
};

/**
 * There is nothing to put back: the rows removed were re-derivable from the
 * provider and are re-derived by the next ingestion runs. Rolling the schema
 * back leaves the walk where it is.
 *
 * @param {import('knex').Knex} _knex
 */
exports.down = async function down(_knex) {};
