import {
  confluenceContributions,
  confluenceSpaceIsActive,
  confluenceSpacesContributedTo,
  confluenceStaleShare,
  confluenceViewsPerPage,
  hasConfluenceActivity,
  mergeConfluenceContributorMetrics,
  type ConfluenceContributorMetrics,
  type ConfluenceSpaceMetrics,
} from "../src/confluence_metrics";

const WINDOW = { from: "2026-06-01T00:00:00.000Z", to: "2026-08-30T00:00:00.000Z" };

const metrics = (
  overrides: Partial<ConfluenceContributorMetrics> = {},
): ConfluenceContributorMetrics => ({
  window: WINDOW,
  pagesCreated: 0,
  pagesEdited: 0,
  pageVersionsAuthored: 0,
  blogPostsCreated: 0,
  commentsWritten: 0,
  attachmentsAdded: 0,
  spaceKeys: [],
  wordsAdded: null,
  wordsRemoved: null,
  volumeUnit: "none",
  pagesMeasuredForVolume: 0,
  pageViews: null,
  pagesMeasuredForViews: 0,
  analytics: "not-measured",
  ...overrides,
});

const space = (
  overrides: Partial<ConfluenceSpaceMetrics> = {},
): ConfluenceSpaceMetrics => ({
  space: { key: "ENG", name: "Engineering", url: null },
  window: WINDOW,
  totalPages: 100,
  pagesCreated: 0,
  pagesEdited: 0,
  blogPostsCreated: 0,
  commentsWritten: 0,
  attachmentsAdded: 0,
  contributors: null,
  lastActivityAt: null,
  stalePages: null,
  staleAfterDays: 180,
  stalestPage: null,
  parentlessPages: null,
  pageViews: null,
  pagesMeasuredForViews: 0,
  analytics: "not-measured",
  ...overrides,
});

describe("mergeConfluenceContributorMetrics", () => {
  it("should add the counts of two accounts belonging to one person", () => {
    // given
    const personal = metrics({ pagesCreated: 3, commentsWritten: 10 });
    const corporate = metrics({ pagesCreated: 5, commentsWritten: 2 });

    // when
    const merged = mergeConfluenceContributorMetrics(personal, corporate);

    // then
    expect(merged.pagesCreated).toBe(8);
    expect(merged.commentsWritten).toBe(12);
  });

  it("should union the spaces rather than adding their counts", () => {
    // given
    // Someone working in one space from two logins works in one space, and
    // adding the two counts would report them as spread across two.
    const left = metrics({ spaceKeys: ["eng", "ops"] });
    const right = metrics({ spaceKeys: ["eng"] });

    // when
    const merged = mergeConfluenceContributorMetrics(left, right);

    // then
    expect(merged.spaceKeys).toEqual(["eng", "ops"]);
    expect(confluenceSpacesContributedTo(merged)).toBe(2);
  });

  it("should keep the volume null when neither account was measured", () => {
    // given
    // Absence has to survive the merge, or an unmeasured person reads as one
    // who wrote nothing.
    const left = metrics({ wordsAdded: null, volumeUnit: "none" });
    const right = metrics({ wordsAdded: null, volumeUnit: "none" });

    // when
    const merged = mergeConfluenceContributorMetrics(left, right);

    // then
    expect(merged.wordsAdded).toBeNull();
    expect(merged.volumeUnit).toBe("none");
  });

  it("should carry a measured volume through when only one account was measured", () => {
    // given
    const measured = metrics({
      wordsAdded: 400,
      wordsRemoved: 120,
      volumeUnit: "words",
      pagesMeasuredForVolume: 4,
    });
    const unmeasured = metrics();

    // when
    const merged = mergeConfluenceContributorMetrics(unmeasured, measured);

    // then
    expect(merged.wordsAdded).toBe(400);
    expect(merged.wordsRemoved).toBe(120);
    expect(merged.volumeUnit).toBe("words");
    expect(merged.pagesMeasuredForVolume).toBe(4);
  });

  it("should widen the window to cover both accounts", () => {
    // given
    // A figure labelled with a period part of it falls outside is worse than an
    // unlabelled one, so the merge widens rather than picking a side.
    const older = metrics({
      window: { from: "2026-01-01T00:00:00.000Z", to: "2026-06-01T00:00:00.000Z" },
    });
    const newer = metrics({
      window: { from: "2026-03-01T00:00:00.000Z", to: "2026-08-30T00:00:00.000Z" },
    });

    // when
    const merged = mergeConfluenceContributorMetrics(older, newer);

    // then
    expect(merged.window).toEqual({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-08-30T00:00:00.000Z",
    });
  });

  it("should prefer a real analytics reading over a refusal", () => {
    // given
    const refused = metrics({ analytics: "unavailable" });
    const read = metrics({ analytics: "measured", pageViews: 40, pagesMeasuredForViews: 2 });

    // when
    const merged = mergeConfluenceContributorMetrics(refused, read);

    // then
    expect(merged.analytics).toBe("measured");
    expect(merged.pageViews).toBe(40);
  });

  it("should prefer a refusal over never having asked", () => {
    // given
    // A refusal is a fact about the site the dashboard can explain; "we did not
    // ask" is only a fact about this run.
    const refused = metrics({ analytics: "unavailable" });
    const skipped = metrics({ analytics: "not-measured" });

    // when
    const merged = mergeConfluenceContributorMetrics(skipped, refused);

    // then
    expect(merged.analytics).toBe("unavailable");
  });

  it("should report not-measured when neither account asked", () => {
    // given
    const left = metrics();
    const right = metrics();

    // when
    const merged = mergeConfluenceContributorMetrics(left, right);

    // then
    expect(merged.analytics).toBe("not-measured");
  });
});

describe("confluenceContributions", () => {
  it("should add every kind of contribution together", () => {
    // given
    const person = metrics({
      pagesCreated: 2,
      pageVersionsAuthored: 7,
      blogPostsCreated: 1,
      commentsWritten: 5,
      attachmentsAdded: 3,
    });

    // when
    const total = confluenceContributions(person);

    // then
    expect(total).toBe(18);
  });

  it("should report no activity for someone who did nothing", () => {
    // given
    const idle = metrics();

    // when / then
    expect(hasConfluenceActivity(idle)).toBe(false);
    expect(hasConfluenceActivity(metrics({ commentsWritten: 1 }))).toBe(true);
  });
});

describe("confluenceViewsPerPage", () => {
  it("should divide the views by the pages the run actually looked up", () => {
    // given
    const person = metrics({
      analytics: "measured",
      pageViews: 250,
      pagesMeasuredForViews: 4,
    });

    // when
    const rate = confluenceViewsPerPage(person);

    // then
    expect(rate).toBe(62.5);
  });

  it("should stay null when analytics reported nothing", () => {
    // given
    // Premium-only endpoint on a Standard site: a zero here would read as "the
    // pages were published and nobody opened them".
    const person = metrics({ analytics: "unavailable", pagesMeasuredForViews: 4 });

    // when / then
    expect(confluenceViewsPerPage(person)).toBeNull();
  });

  it("should stay null when no page was looked up", () => {
    // given
    const person = metrics({ analytics: "measured", pageViews: 0, pagesMeasuredForViews: 0 });

    // when / then
    expect(confluenceViewsPerPage(person)).toBeNull();
  });
});

describe("confluenceStaleShare", () => {
  it("should report the share of a space that has gone stale", () => {
    // given
    const engineering = space({ totalPages: 200, stalePages: 51 });

    // when
    const share = confluenceStaleShare(engineering);

    // then
    expect(share).toBe(25.5);
  });

  it("should stay null when the space was never counted", () => {
    // given
    // No denominator means no percentage; 0% would read as a space in perfect
    // health rather than one nobody measured.
    const unmeasured = space({ totalPages: null, stalePages: 4 });

    // when / then
    expect(confluenceStaleShare(unmeasured)).toBeNull();
  });

  it("should stay null when staleness itself was not measured", () => {
    // given
    const unmeasured = space({ totalPages: 200, stalePages: null });

    // when / then
    expect(confluenceStaleShare(unmeasured)).toBeNull();
  });

  it("should stay null for an empty space rather than dividing by zero", () => {
    // given
    const empty = space({ totalPages: 0, stalePages: 0 });

    // when / then
    expect(confluenceStaleShare(empty)).toBeNull();
  });
});

describe("confluenceSpaceIsActive", () => {
  it("should call a space with any edit in the window active", () => {
    // given
    const edited = space({ pagesEdited: 1 });

    // when / then
    expect(confluenceSpaceIsActive(edited)).toBe(true);
  });

  it("should call a space nobody touched inactive", () => {
    // given
    const untouched = space();

    // when / then
    expect(confluenceSpaceIsActive(untouched)).toBe(false);
  });
});
