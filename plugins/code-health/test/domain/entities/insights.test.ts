import {
  complianceBreakdown,
  computeKpis,
  qualityGateBreakdown,
  toCadence,
  topContributorsByCommits,
  topRepositoriesByCommits,
  topReviewers,
} from "../../../src/domain/entities/insights";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { RepositoryBuilder } from "../../builders/repository_builder";

describe("topContributorsByCommits", () => {
  it("should rank contributors by commits, highest first", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withKey("low").withCommits(3).build(),
      ContributorBuilder.create().withKey("high").withCommits(30).build(),
      ContributorBuilder.create().withKey("mid").withCommits(12).build(),
    ];

    // when
    const ranked = topContributorsByCommits(contributors);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["high", "mid", "low"]);
  });

  it("should keep at most five contributors", () => {
    // given
    const contributors = Array.from({ length: 9 }, (_, index) =>
      ContributorBuilder.create().withKey(`c${index}`).withCommits(index + 1).build(),
    );

    // when
    const ranked = topContributorsByCommits(contributors);

    // then
    expect(ranked).toHaveLength(5);
    expect(ranked[0].id).toBe("c8");
  });

  it("should drop contributors with no commits", () => {
    // given
    // A "top 5" padded with zeroes reads as five active people when only one is.
    const contributors = [
      ContributorBuilder.create().withKey("active").withCommits(4).build(),
      ContributorBuilder.create().withKey("idle").withCommits(0).build(),
    ];

    // when
    const ranked = topContributorsByCommits(contributors);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["active"]);
  });

  it("should carry the catalog entity and avatar through to the chart", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withKey("jane@example.com")
        .withCommits(7)
        .withEntityRef("user:default/jane.doe")
        .withAvatarUrl("https://example.test/jane.png")
        .build(),
    ];

    // when
    const [ranked] = topContributorsByCommits(contributors);

    // then
    expect(ranked.entityRef).toBe("user:default/jane.doe");
    expect(ranked.avatarUrl).toBe("https://example.test/jane.png");
  });

  it("should break a tie on the label so the order is stable", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withKey("b").withDisplayName("Bob").withCommits(5).build(),
      ContributorBuilder.create().withKey("a").withDisplayName("Alice").withCommits(5).build(),
    ];

    // when
    const ranked = topContributorsByCommits(contributors);

    // then
    expect(ranked.map((item) => item.label)).toEqual(["Alice", "Bob"]);
  });
});

describe("topReviewers", () => {
  it("should rank by reviews given rather than commits", () => {
    // given
    // The two questions have different answers, which is the reason the chart exists.
    const contributors = [
      ContributorBuilder.create()
        .withKey("committer")
        .withCommits(50)
        .withReviewsGiven(1)
        .build(),
      ContributorBuilder.create()
        .withKey("reviewer")
        .withCommits(2)
        .withReviewsGiven(40)
        .build(),
    ];

    // when
    const ranked = topReviewers(contributors);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["reviewer", "committer"]);
  });
});

describe("topRepositoriesByCommits", () => {
  it("should rank repositories by commits and link them to the catalog", () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withId("quiet")
        .withActivity({ commits: 1 })
        .build(),
      RepositoryBuilder.create()
        .withId("busy")
        .withEntityRef("component:default/busy")
        .withActivity({ commits: 40 })
        .build(),
    ];

    // when
    const ranked = topRepositoriesByCommits(repositories);

    // then
    expect(ranked.map((item) => item.id)).toEqual(["busy", "quiet"]);
    expect(ranked[0].entityRef).toBe("component:default/busy");
  });
});

describe("qualityGateBreakdown", () => {
  it("should count passing, failing and unmeasured repositories separately", () => {
    // given
    // "Not measured" is not a failure — folding the two together overstates the
    // problem and points the reader at the wrong fix.
    const repositories = [
      RepositoryBuilder.create().withId("a").withQualityGate("OK").build(),
      RepositoryBuilder.create().withId("b").withQualityGate("ERROR").build(),
      RepositoryBuilder.create().withId("c").build(),
    ];

    // when
    const slices = qualityGateBreakdown(repositories);

    // then
    expect(slices).toEqual([
      { label: "Passing", count: 1, tone: "good" },
      { label: "Failing", count: 1, tone: "critical" },
      { label: "Not measured", count: 1, tone: "unknown" },
    ]);
  });
});

describe("complianceBreakdown", () => {
  it("should map each compliance colour to its own tone", () => {
    // given
    const repositories = [
      RepositoryBuilder.create().withId("a").withComplianceColor("green").build(),
      RepositoryBuilder.create().withId("b").withComplianceColor("yellow").build(),
      RepositoryBuilder.create().withId("c").withComplianceColor("red").build(),
      RepositoryBuilder.create().withId("d").build(),
    ];

    // when
    const slices = complianceBreakdown(repositories);

    // then
    expect(slices.map((slice) => [slice.label, slice.count])).toEqual([
      ["Compliant", 1],
      ["One check missing", 1],
      ["Two or more missing", 1],
      ["Not measured", 1],
    ]);
  });
});

describe("computeKpis", () => {
  it("should count active repositories by commits rather than by tracking", () => {
    // given
    const repositories = [
      RepositoryBuilder.create().withId("a").withActivity({ commits: 5 }).build(),
      RepositoryBuilder.create().withId("b").withActivity({ commits: 0 }).build(),
    ];

    // when
    const kpis = computeKpis(repositories, []);

    // then
    expect(kpis.activeRepositories).toBe(1);
    expect(kpis.trackedRepositories).toBe(2);
  });

  it("should count each contributor once across repositories", () => {
    // given
    // Adding up `activity.contributors` per repository would count anyone who
    // worked in two of them twice.
    const repositories = [
      RepositoryBuilder.create()
        .withId("a")
        .withActivity({ commits: 3, contributors: 1 })
        .build(),
      RepositoryBuilder.create()
        .withId("b")
        .withActivity({ commits: 4, contributors: 1 })
        .build(),
    ];
    const contributors = [ContributorBuilder.create().withKey("one").withCommits(7).build()];

    // when
    const kpis = computeKpis(repositories, contributors);

    // then
    expect(kpis.activeContributors).toBe(1);
    expect(kpis.commits).toBe(7);
  });

  it("should report the build success rate across the fleet", () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withId("a")
        .withActivity({ builds: 8, buildsSucceeded: 6 })
        .build(),
      RepositoryBuilder.create()
        .withId("b")
        .withActivity({ builds: 2, buildsSucceeded: 2 })
        .build(),
    ];

    // when
    const kpis = computeKpis(repositories, []);

    // then
    expect(kpis.buildSuccessRate).toBe(80);
  });

  it("should report no build rate when nothing ran", () => {
    // given
    const repositories = [RepositoryBuilder.create().withId("a").build()];

    // when
    const kpis = computeKpis(repositories, []);

    // then
    // Null rather than 0%: "nothing ran" and "everything failed" are different
    // situations and must not render the same.
    expect(kpis.buildSuccessRate).toBeNull();
  });

  it("should cap review coverage at one hundred percent", () => {
    // given
    // A pull request can collect several reviews, so the raw ratio runs past 100.
    const repositories = [
      RepositoryBuilder.create()
        .withId("a")
        .withActivity({ pullRequestsMerged: 2 })
        .build(),
    ];
    const contributors = [
      ContributorBuilder.create().withKey("a").withReviewsGiven(9).build(),
    ];

    // when
    const kpis = computeKpis(repositories, contributors);

    // then
    expect(kpis.reviewCoverage).toBe(100);
  });
});

describe("toCadence", () => {
  it("should flatten the backend buckets to the two plotted series", () => {
    // given
    const points = [
      {
        day: "2026-08-01",
        activity: {
          commits: 12,
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          contributors: 3,
          pullRequestsOpened: 5,
          pullRequestsMerged: 4,
          pullRequestsAbandoned: 0,
          builds: 0,
          buildsSucceeded: 0,
          buildsFailed: 0,
          releases: 0,
          tags: 0,
        },
      },
    ];

    // when
    const cadence = toCadence(points);

    // then
    expect(cadence).toEqual([{ day: "2026-08-01", commits: 12, pullRequestsMerged: 4 }]);
  });
});
