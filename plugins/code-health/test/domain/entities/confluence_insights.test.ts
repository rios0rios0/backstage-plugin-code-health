import type {
  ConfluenceContributorMetrics,
  ConfluenceSpaceMetrics,
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  confluenceFleetStats,
  contributorConfluence,
  repositoryConfluence,
  spaceFreshnessBreakdown,
  STALE_SPACE_TARGET,
  stalestSpaces,
  strandedPages,
  topConfluenceAuthors,
  topConfluenceWriters,
} from "../../../src/domain/entities/confluence_insights";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { RepositoryBuilder } from "../../builders/repository_builder";

const WINDOW = { from: "2026-05-30T00:00:00.000Z", to: "2026-08-28T00:00:00.000Z" };

const confluence = (
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
  space: { key: "ENG", name: "Engineering", url: "https://acme.atlassian.net/wiki/spaces/ENG" },
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

/**
 * Attaches a Confluence payload to a row.
 *
 * Written here rather than in the shared builders because the builders belong
 * to every integration at once, and this one is the Confluence tests' own view
 * of a row.
 */
const withContributorMetrics = (
  contributor: ContributorSummary,
  metrics: ConfluenceContributorMetrics | null,
): ContributorSummary & { readonly confluenceMetrics: ConfluenceContributorMetrics | null } => ({
  ...contributor,
  confluenceMetrics: metrics,
});

const withSpaceMetrics = (
  repository: RepositorySummary,
  metrics: ConfluenceSpaceMetrics | null,
): RepositorySummary & { readonly confluenceMetrics: ConfluenceSpaceMetrics | null } => ({
  ...repository,
  confluenceMetrics: metrics,
});

describe("contributorConfluence and repositoryConfluence", () => {
  it("should report null for a row that carries no Confluence payload", () => {
    // given
    // "Confluence is switched off" and "this person wrote nothing" have to
    // resolve to the same null in one place, so every caller renders an em dash
    // rather than a zero without remembering to.
    const contributor = ContributorBuilder.create().build();
    const repository = RepositoryBuilder.create().build();

    // when / then
    expect(contributorConfluence(contributor)).toBeNull();
    expect(repositoryConfluence(repository)).toBeNull();
  });
});

describe("confluenceFleetStats", () => {
  it("should total the window figures from the spaces, not from the people", () => {
    // given
    // A space count is an exact CQL total; a per-person count only covers
    // whoever the sweep reached before its cap.
    const repositories = [
      withSpaceMetrics(
        RepositoryBuilder.create().withId("a").build(),
        space({ pagesCreated: 5, pagesEdited: 9, commentsWritten: 30, attachmentsAdded: 4 }),
      ),
    ];
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("ada").build(),
        confluence({ pagesCreated: 2 }),
      ),
    ];

    // when
    const stats = confluenceFleetStats(repositories, contributors);

    // then
    expect(stats).toMatchObject({
      spaces: 1,
      pagesCreated: 5,
      pagesEdited: 9,
      commentsWritten: 30,
      attachmentsAdded: 4,
    });
  });

  it("should count a space once when two repositories share it", () => {
    // given
    // Both components carry the same payload, and adding it twice would report
    // a fleet writing twice as much as it does.
    const shared = space({ pagesCreated: 5 });
    const repositories = [
      withSpaceMetrics(RepositoryBuilder.create().withId("a").build(), shared),
      withSpaceMetrics(RepositoryBuilder.create().withId("b").build(), shared),
    ];

    // when
    const stats = confluenceFleetStats(repositories, []);

    // then
    expect(stats.spaces).toBe(1);
    expect(stats.pagesCreated).toBe(5);
  });

  it("should keep the written volume null when nobody could be measured", () => {
    // given
    const contributors = [
      withContributorMetrics(ContributorBuilder.create().build(), confluence()),
    ];

    // when
    const stats = confluenceFleetStats([], contributors);

    // then
    expect(stats.wordsAdded).toBeNull();
    expect(stats.volumeUnit).toBe("none");
  });

  it("should sum only the people whose volume was measured", () => {
    // given
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("ada").build(),
        confluence({ wordsAdded: 400, wordsRemoved: 50, volumeUnit: "words" }),
      ),
      withContributorMetrics(ContributorBuilder.create().withKey("bo").build(), confluence()),
    ];

    // when
    const stats = confluenceFleetStats([], contributors);

    // then
    expect(stats).toMatchObject({ wordsAdded: 400, wordsRemoved: 50, volumeUnit: "words" });
  });

  it("should count only the people who actually did something", () => {
    // given
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("ada").build(),
        confluence({ commentsWritten: 3 }),
      ),
      withContributorMetrics(ContributorBuilder.create().withKey("idle").build(), confluence()),
      withContributorMetrics(ContributorBuilder.create().withKey("none").build(), null),
    ];

    // when
    const stats = confluenceFleetStats([], contributors);

    // then
    expect(stats.authors).toBe(1);
  });

  it("should treat one real analytics reading as the verdict for the site", () => {
    // given
    // One site serves every space, so a single measurement means the plan
    // allows it and the remaining nulls are a budget question, not a plan one.
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("ada").build(),
        confluence({ analytics: "measured", pageViews: 40, pagesMeasuredForViews: 2 }),
      ),
      withContributorMetrics(
        ContributorBuilder.create().withKey("bo").build(),
        confluence({ analytics: "not-measured" }),
      ),
    ];

    // when
    const stats = confluenceFleetStats([], contributors);

    // then
    expect(stats.analytics).toBe("measured");
    expect(stats.pageViews).toBe(40);
  });

  it("should prefer a refusal over never having asked", () => {
    // given
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("ada").build(),
        confluence({ analytics: "unavailable" }),
      ),
      withContributorMetrics(
        ContributorBuilder.create().withKey("bo").build(),
        confluence({ analytics: "not-measured" }),
      ),
    ];

    // when
    const stats = confluenceFleetStats([], contributors);

    // then
    expect(stats.analytics).toBe("unavailable");
    expect(stats.pageViews).toBeNull();
  });

  it("should report not-measured when nothing anywhere asked", () => {
    // given / when
    const stats = confluenceFleetStats([], []);

    // then
    expect(stats).toMatchObject({
      spaces: 0,
      analytics: "not-measured",
      stalePages: null,
      totalPages: null,
    });
  });
});

describe("topConfluenceAuthors", () => {
  it("should rank on every kind of contribution, not on pages alone", () => {
    // given
    // Somebody who spends a quarter correcting other people's runbooks writes
    // very few pages and is doing exactly the work this card exists to show.
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withDisplayName("Writer").withKey("writer").build(),
        confluence({ pagesCreated: 4 }),
      ),
      withContributorMetrics(
        ContributorBuilder.create().withDisplayName("Editor").withKey("editor").build(),
        confluence({ pageVersionsAuthored: 12, commentsWritten: 20 }),
      ),
    ];

    // when
    const ranked = topConfluenceAuthors(contributors);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["editor", "writer"]);
    expect(ranked[0].detail).toBe("0 created");
  });

  it("should drop people who did nothing rather than padding the chart", () => {
    // given
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("active").build(),
        confluence({ pagesCreated: 1 }),
      ),
      withContributorMetrics(ContributorBuilder.create().withKey("idle").build(), confluence()),
      withContributorMetrics(ContributorBuilder.create().withKey("absent").build(), null),
    ];

    // when
    const ranked = topConfluenceAuthors(contributors);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["active"]);
  });

  it("should keep at most five rows", () => {
    // given
    const contributors = Array.from({ length: 9 }, (_unused, index) =>
      withContributorMetrics(
        ContributorBuilder.create().withKey(`c${index}`).build(),
        confluence({ pagesCreated: index + 1 }),
      ),
    );

    // when
    const ranked = topConfluenceAuthors(contributors);

    // then
    expect(ranked).toHaveLength(5);
    expect(ranked[0].id).toBe("c8");
  });
});

describe("topConfluenceWriters", () => {
  it("should rank only the people whose volume was measured", () => {
    // given
    // Ranking an unmeasured person as zero would put them below somebody who
    // deleted a paragraph, which is a statement the data does not support.
    const contributors = [
      withContributorMetrics(
        ContributorBuilder.create().withKey("measured").build(),
        confluence({ wordsAdded: 900, volumeUnit: "words", pagesMeasuredForVolume: 6 }),
      ),
      withContributorMetrics(
        ContributorBuilder.create().withKey("unmeasured").build(),
        confluence({ pagesCreated: 30 }),
      ),
    ];

    // when
    const ranked = topConfluenceWriters(contributors);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["measured"]);
    expect(ranked[0].detail).toBe("6 pages measured");
  });
});

describe("spaceFreshnessBreakdown", () => {
  it("should split the fleet rather than averaging it", () => {
    // given
    // A fleet at 25% stale on average could be every space slightly neglected
    // or two spaces abandoned, and those are different conversations.
    const repositories = [
      withSpaceMetrics(
        RepositoryBuilder.create().withId("fresh").build(),
        space({ space: { key: "A", name: null, url: null }, totalPages: 100, stalePages: 5 }),
      ),
      withSpaceMetrics(
        RepositoryBuilder.create().withId("ageing").build(),
        space({ space: { key: "B", name: null, url: null }, totalPages: 100, stalePages: 20 }),
      ),
      withSpaceMetrics(
        RepositoryBuilder.create().withId("rotting").build(),
        space({ space: { key: "C", name: null, url: null }, totalPages: 100, stalePages: 60 }),
      ),
      withSpaceMetrics(
        RepositoryBuilder.create().withId("unknown").build(),
        space({ space: { key: "D", name: null, url: null }, totalPages: null }),
      ),
    ];

    // when
    const slices = spaceFreshnessBreakdown(repositories);

    // then
    expect(slices).toEqual([
      { label: "Mostly current", count: 1, tone: "good" },
      { label: "Ageing", count: 1, tone: "warning" },
      { label: `Over ${STALE_SPACE_TARGET}% stale`, count: 1, tone: "critical" },
      { label: "Not measured", count: 1, tone: "unknown" },
    ]);
  });
});

describe("stalestSpaces", () => {
  it("should name the spaces carrying the most rot, worst first", () => {
    // given
    // A bar says how many pages went stale; this says where, because "four
    // hundred stale pages" is not actionable until somebody knows which space.
    const repositories = [
      withSpaceMetrics(
        RepositoryBuilder.create().withId("a").build(),
        space({
          space: { key: "ENG", name: "Engineering", url: null },
          totalPages: 100,
          stalePages: 10,
        }),
      ),
      withSpaceMetrics(
        RepositoryBuilder.create().withId("b").build(),
        space({
          space: { key: "OPS", name: "Operations", url: null },
          totalPages: 100,
          stalePages: 60,
          stalestPage: {
            id: "5005",
            title: "Onboarding",
            url: null,
            lastModifiedAt: "2021-03-04T09:00:00.000Z",
          },
        }),
      ),
    ];

    // when
    const gaps = stalestSpaces(repositories);

    // then
    expect(gaps.items.map((item) => item.id)).toEqual(["OPS", "ENG"]);
    expect(gaps.items[0].reason).toBe("60% stale · oldest 2021-03-04");
    expect(gaps.items[1].reason).toBe("10% stale");
  });

  it("should say a page was never edited when the site reported no timestamp", () => {
    // given
    const repositories = [
      withSpaceMetrics(
        RepositoryBuilder.create().withId("a").build(),
        space({
          space: { key: "OPS", name: null, url: null },
          totalPages: 50,
          stalePages: 25,
          stalestPage: { id: "1", title: "Ancient", url: null, lastModifiedAt: null },
        }),
      ),
    ];

    // when
    const gaps = stalestSpaces(repositories);

    // then
    expect(gaps.items[0]).toMatchObject({
      label: "OPS",
      reason: "50% stale · oldest never edited",
    });
  });

  it("should leave a space nobody measured off the list", () => {
    // given
    const repositories = [
      withSpaceMetrics(
        RepositoryBuilder.create().withId("a").build(),
        space({ totalPages: null, stalePages: 4 }),
      ),
    ];

    // when
    const gaps = stalestSpaces(repositories);

    // then
    expect(gaps.items).toEqual([]);
    expect(gaps.remaining).toBe(0);
  });
});

describe("strandedPages", () => {
  it("should list the spaces holding pages with no parent", () => {
    // given
    // A parentless page is unreachable by browsing — somebody has to already
    // know the link — which is the cheapest gap there is to close.
    const repositories = [
      withSpaceMetrics(
        RepositoryBuilder.create().withId("a").build(),
        space({ space: { key: "ENG", name: "Engineering", url: null }, parentlessPages: 7 }),
      ),
      withSpaceMetrics(
        RepositoryBuilder.create().withId("b").build(),
        space({ space: { key: "OPS", name: null, url: null }, parentlessPages: 0 }),
      ),
      withSpaceMetrics(
        RepositoryBuilder.create().withId("c").build(),
        space({ space: { key: "SEC", name: null, url: null }, parentlessPages: null }),
      ),
    ];

    // when
    const gaps = strandedPages(repositories);

    // then
    expect(gaps.items).toEqual([
      {
        id: "ENG",
        label: "Engineering",
        entityRef: null,
        reason: "7 with no parent",
      },
    ]);
  });
});
