/**
 * The period a set of Confluence measures covers, as ISO 8601 instants.
 *
 * Carried on the payload rather than left implicit in the row's day key,
 * because Confluence is the one integration here that answers historically and
 * therefore measures a window of its own choosing: a trailing `historyDays`,
 * fixed by backend configuration, not the window the dashboard's range picker
 * is asking about. Without this field "12 pages" would silently mean a
 * different period from the commit count sitting next to it, and nothing on
 * screen would say so.
 */
export interface ConfluenceWindow {
  readonly from: string;
  readonly to: string;
}

/**
 * What a Confluence written-volume figure is counted in.
 *
 * Confluence has no notion of a line, and asking it for one is not a matter of
 * finding the right endpoint. A page is a body document — XHTML storage format
 * or ADF — and the REST API serves no diff between two versions, so there is
 * nothing anywhere in it from which "lines changed" could be derived. Words are
 * what *can* be measured exactly: the enricher counts the words in the body of
 * each version it fetched and takes the difference against the version before
 * it.
 *
 * The unit rides on the payload for the same reason `ChurnUnit` does. A
 * run that could not afford to fetch page bodies has measured nothing, and a
 * `0` there reads as "this person wrote nothing" rather than "nobody counted".
 * The unit is decided by whether the volume was *measured*, never by whether it
 * came back above zero — a week spent reviewing other people's pages is a real
 * measurement of zero words.
 */
export type ConfluenceVolumeUnit = "words" | "none";

/**
 * Whether the Confluence analytics API answered.
 *
 * Page views and viewer counts live at `/wiki/rest/api/analytics/content/...`,
 * which is **Confluence Cloud Premium only**. A Standard site answers 403 or
 * 404 there whatever the credential, so "no views" is overwhelmingly likely to
 * mean "this site is not on Premium" rather than "nobody read the page". The
 * three states are kept apart because each calls for different words on screen:
 *
 * - `measured` — the API answered and the figure is real.
 * - `unavailable` — the API refused. The site is not on Premium, or the token
 *   cannot see analytics. Nothing the team writes will change the number.
 * - `not-measured` — the run did not ask, because the lookup budget was spent
 *   on pages elsewhere. Asking again tomorrow may well produce a figure.
 */
export type ConfluenceAnalyticsState = "measured" | "unavailable" | "not-measured";

/**
 * One person's Confluence output over {@link ConfluenceContributorMetrics.window}.
 *
 * Every field is a count or a total, never a ratio, and that is deliberate.
 * Identity linking maps several accounts onto one human, so these payloads get
 * added together — and a mean of two means is not a mean. Where the dashboard
 * wants a rate it is derived here from the numerator and the denominator, both
 * of which are carried: {@link confluenceViewsPerPage} divides `pageViews` by
 * `pagesMeasuredForViews` rather than storing the quotient.
 *
 * `spaceKeys` is the one field that is a set rather than a total, for the same
 * reason: the number of spaces one person touched is the size of a *union*, and
 * adding two counts would report a person who works in one space from two
 * accounts as working in two.
 */
export interface ConfluenceContributorMetrics {
  readonly window: ConfluenceWindow;
  /** Pages whose first version this person authored inside the window. */
  readonly pagesCreated: number;
  /**
   * Distinct pages this person authored at least one version of.
   *
   * Summed across the linked accounts of one person, which over-counts a page
   * edited from two of their accounts inside the same window. Shipping every
   * page id to make the union exact would put an unbounded array on every row
   * to correct a case that needs somebody to hold two Atlassian logins and use
   * both on one page in ninety days.
   */
  readonly pagesEdited: number;
  /** Versions authored, including the one that created a page. */
  readonly pageVersionsAuthored: number;
  readonly blogPostsCreated: number;
  /**
   * Comments written, inline and footer together.
   *
   * Confluence's CQL vocabulary has one `comment` type covering both, and the
   * v2 endpoints that *do* separate them (`/footer-comments`,
   * `/inline-comments`) take no date filter at all — splitting the figure would
   * mean walking every comment on the site to find the ninety days that matter.
   */
  readonly commentsWritten: number;
  readonly attachmentsAdded: number;
  /** Spaces this person touched, lowercased and de-duplicated. */
  readonly spaceKeys: readonly string[];
  /** Null when no page of theirs could be measured; never 0 for that case. */
  readonly wordsAdded: number | null;
  readonly wordsRemoved: number | null;
  readonly volumeUnit: ConfluenceVolumeUnit;
  /** Pages of theirs the run actually fetched bodies for. */
  readonly pagesMeasuredForVolume: number;
  /** Views of pages this person created, or null when analytics is not readable. */
  readonly pageViews: number | null;
  /** The denominator behind `pageViews`, so a rate can be derived on merge. */
  readonly pagesMeasuredForViews: number;
  readonly analytics: ConfluenceAnalyticsState;
}

/** Enough of a Confluence space to name it and link to it. */
export interface ConfluenceSpaceReference {
  readonly key: string;
  readonly name: string | null;
  readonly url: string | null;
}

/** Enough of a page to name it and link to it. */
export interface ConfluencePageReference {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
  /** ISO 8601, or null when the provider did not report one. */
  readonly lastModifiedAt: string | null;
}

/**
 * One space's state, attached to the repository whose catalog entity names it
 * through the `confluence.io/space-key` annotation.
 *
 * The counts split into two kinds and the nullability follows the split. The
 * window figures come from CQL counts, which are exact and cost one request
 * each, so they are plain numbers. Everything that needed a walk —
 * `contributors`, `parentlessPages`, and the analytics figures — is null
 * whenever the walk was cut short by its cap, because a truncated walk produces
 * an under-count that looks exactly like a healthy space.
 */
export interface ConfluenceSpaceMetrics {
  readonly space: ConfluenceSpaceReference;
  readonly window: ConfluenceWindow;
  /** Pages in the space today, at any age. */
  readonly totalPages: number | null;
  readonly pagesCreated: number;
  readonly pagesEdited: number;
  readonly blogPostsCreated: number;
  readonly commentsWritten: number;
  readonly attachmentsAdded: number;
  /** Distinct people who touched the space, or null when the walk was capped. */
  readonly contributors: number | null;
  readonly lastActivityAt: string | null;
  /** Pages untouched for at least `staleAfterDays`. */
  readonly stalePages: number | null;
  readonly staleAfterDays: number;
  /** The single page nobody has edited for longest — the rot, by name. */
  readonly stalestPage: ConfluencePageReference | null;
  /**
   * Pages with no parent, excluding the space homepage.
   *
   * Deliberately not called "orphan pages". Confluence's own orphan report
   * meant no parent *and* no inbound links, and Confluence Cloud's REST API
   * exposes no backlink query of any kind — there is no endpoint that answers
   * "what links here". Half the definition is measurable, so the field is named
   * for the half that is.
   */
  readonly parentlessPages: number | null;
  readonly pageViews: number | null;
  readonly pagesMeasuredForViews: number;
  readonly analytics: ConfluenceAnalyticsState;
}

/**
 * Adds two optional totals without inventing a measurement.
 *
 * A null side contributed no measurement rather than a zero, so it is skipped;
 * the result is null only when neither side measured anything. The coverage
 * fields beside each total are what stop the sum from over-claiming — a person
 * whose second account was never measured still reports honestly, because
 * `pagesMeasuredForVolume` says how many pages the figure came from.
 */
const addMeasured = (left: number | null, right: number | null): number | null => {
  if (left === null) return right;
  if (right === null) return left;
  return left + right;
};

const earliest = (left: string, right: string): string => (left <= right ? left : right);
const latest = (left: string, right: string): string => (left >= right ? left : right);

/**
 * The stronger of two analytics verdicts.
 *
 * `measured` wins because one real figure is a real figure. `unavailable`
 * outranks `not-measured` because a refusal is a fact about the site that the
 * dashboard can explain, while "we did not ask" is only a fact about this run.
 */
const mergeAnalytics = (
  left: ConfluenceAnalyticsState,
  right: ConfluenceAnalyticsState,
): ConfluenceAnalyticsState => {
  if (left === "measured" || right === "measured") return "measured";
  if (left === "unavailable" || right === "unavailable") return "unavailable";
  return "not-measured";
};

/**
 * Folds two Confluence payloads belonging to the same human into one.
 *
 * Called by the read API when identity linking resolves several Atlassian
 * accounts to one catalog user — somebody who kept a personal account from
 * before an acquisition, or whose contractor login still holds a year of pages.
 * The window widens to cover both sides rather than picking one, so a figure is
 * never labelled with a period part of it falls outside.
 */
export const mergeConfluenceContributorMetrics = (
  left: ConfluenceContributorMetrics,
  right: ConfluenceContributorMetrics,
): ConfluenceContributorMetrics => {
  const wordsAdded = addMeasured(left.wordsAdded, right.wordsAdded);

  return {
    window: {
      from: earliest(left.window.from, right.window.from),
      to: latest(left.window.to, right.window.to),
    },
    pagesCreated: left.pagesCreated + right.pagesCreated,
    pagesEdited: left.pagesEdited + right.pagesEdited,
    pageVersionsAuthored: left.pageVersionsAuthored + right.pageVersionsAuthored,
    blogPostsCreated: left.blogPostsCreated + right.blogPostsCreated,
    commentsWritten: left.commentsWritten + right.commentsWritten,
    attachmentsAdded: left.attachmentsAdded + right.attachmentsAdded,
    spaceKeys: [...new Set([...left.spaceKeys, ...right.spaceKeys])].sort(),
    wordsAdded,
    wordsRemoved: addMeasured(left.wordsRemoved, right.wordsRemoved),
    // Derived from the merged total rather than from either side's flag: two
    // unmeasured accounts stay unmeasured, and one measured account is enough
    // to make the figure mean something.
    volumeUnit: wordsAdded === null ? "none" : "words",
    pagesMeasuredForVolume:
      left.pagesMeasuredForVolume + right.pagesMeasuredForVolume,
    pageViews: addMeasured(left.pageViews, right.pageViews),
    pagesMeasuredForViews: left.pagesMeasuredForViews + right.pagesMeasuredForViews,
    analytics: mergeAnalytics(left.analytics, right.analytics),
  };
};

/** How many distinct spaces a person contributed to. */
export const confluenceSpacesContributedTo = (
  metrics: ConfluenceContributorMetrics,
): number => metrics.spaceKeys.length;

/**
 * Everything a person did in Confluence, as one figure.
 *
 * Pages, edits, comments, blog posts and attachments are added together
 * unweighted. A comment is obviously not a page, and no weighting that claimed
 * otherwise would survive an argument with the first person to read it — so the
 * figure is presented as "contributions", used only to rank people against each
 * other, and the columns break it back out for anyone who wants to know which
 * kind of work it was.
 */
export const confluenceContributions = (
  metrics: ConfluenceContributorMetrics,
): number =>
  metrics.pagesCreated +
  metrics.pageVersionsAuthored +
  metrics.blogPostsCreated +
  metrics.commentsWritten +
  metrics.attachmentsAdded;

/** Whether a person did anything at all in the window. */
export const hasConfluenceActivity = (
  metrics: ConfluenceContributorMetrics,
): boolean => confluenceContributions(metrics) > 0;

/**
 * Views per page, over the pages the run actually looked up.
 *
 * Derived rather than stored so that merging two accounts produces the right
 * answer: adding two averages would not, and the numerator and denominator are
 * both carried precisely so this can be computed after the merge.
 */
export const confluenceViewsPerPage = (
  metrics: ConfluenceContributorMetrics,
): number | null => {
  if (metrics.pageViews === null || metrics.pagesMeasuredForViews <= 0) return null;
  return Math.round((metrics.pageViews / metrics.pagesMeasuredForViews) * 10) / 10;
};

/**
 * The share of a space's pages that have gone stale, as a percentage.
 *
 * Null rather than zero when either half is unknown: a space whose page count
 * was never established has no denominator, and reporting 0% would read as a
 * space in perfect health.
 */
export const confluenceStaleShare = (
  metrics: ConfluenceSpaceMetrics,
): number | null => {
  if (metrics.stalePages === null || metrics.totalPages === null) return null;
  if (metrics.totalPages <= 0) return null;
  return Math.round((metrics.stalePages / metrics.totalPages) * 1000) / 10;
};

/** Whether a space saw any editing at all inside the window. */
export const confluenceSpaceIsActive = (metrics: ConfluenceSpaceMetrics): boolean =>
  metrics.pagesCreated +
    metrics.pagesEdited +
    metrics.blogPostsCreated +
    metrics.commentsWritten +
    metrics.attachmentsAdded >
  0;
