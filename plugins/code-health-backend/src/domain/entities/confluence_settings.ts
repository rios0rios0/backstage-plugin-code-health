/**
 * How much of Confluence one snapshot pass is allowed to read.
 *
 * The site, the credential, the spaces and the window all live on
 * `AtlassianSettings`, because Jira and Confluence share them. What is left
 * here is the part only Confluence needs, and it is all about cost.
 *
 * Confluence is unusual among the providers in this plugin in that its *counts*
 * are cheap and its *attribution* is not. A CQL search reports `totalSize` for
 * any query, so "how many pages were created in this space last quarter" is one
 * request whatever the answer. But CQL only ever names a page's creator and its
 * most recent editor, so working out who authored the four versions in between
 * costs one request per page, and measuring how much was written costs one more
 * per version on top of that.
 *
 * The three caps below are therefore not one budget split three ways. They
 * bound three walks whose costs scale with completely different things, and
 * each degrades on its own: passing a cap makes the figure it governs null
 * rather than truncating it into an under-count that would look exactly like a
 * quiet quarter.
 */
export interface ConfluenceSettings {
  /** Days without an edit after which a page counts as stale. */
  readonly staleAfterDays: number;
  /** Pages a run will fetch a version history for, across every space. */
  readonly maxPagesPerRun: number;
  /** Of those, how many it will fetch bodies for to measure written volume. */
  readonly maxPagesForVolume: number;
  /** Pages a run will ask the analytics API about. Premium sites only. */
  readonly maxAnalyticsLookups: number;
}

/**
 * Six months without an edit.
 *
 * Long enough that a stable reference page is not accused of rotting, short
 * enough that a runbook nobody has opened since the last reorganisation shows
 * up while it still matters.
 */
export const DEFAULT_CONFLUENCE_STALE_AFTER_DAYS = 180;

export const DEFAULT_CONFLUENCE_MAX_PAGES_PER_RUN = 500;
export const DEFAULT_CONFLUENCE_MAX_PAGES_FOR_VOLUME = 150;
export const DEFAULT_CONFLUENCE_MAX_ANALYTICS_LOOKUPS = 200;

export const DEFAULT_CONFLUENCE_SETTINGS: ConfluenceSettings = {
  staleAfterDays: DEFAULT_CONFLUENCE_STALE_AFTER_DAYS,
  maxPagesPerRun: DEFAULT_CONFLUENCE_MAX_PAGES_PER_RUN,
  maxPagesForVolume: DEFAULT_CONFLUENCE_MAX_PAGES_FOR_VOLUME,
  maxAnalyticsLookups: DEFAULT_CONFLUENCE_MAX_ANALYTICS_LOOKUPS,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window a run measures, ending at the instant it started.
 *
 * Anchored on `now` rather than on midnight because a Confluence figure is
 * always a trailing window rather than a calendar period: there is no cursor
 * and no backfill here — every run re-measures the same span — so snapping to a
 * day boundary would move the label by up to a day without making the
 * measurement any more stable.
 */
export const confluenceWindowFor = (
  historyDays: number,
  now: Date,
): { readonly from: Date; readonly to: Date } => ({
  from: new Date(now.getTime() - historyDays * DAY_MS),
  to: now,
});

/** The instant before which a page counts as stale. */
export const confluenceStaleCutoff = (
  settings: ConfluenceSettings,
  now: Date,
): Date => new Date(now.getTime() - settings.staleAfterDays * DAY_MS);
