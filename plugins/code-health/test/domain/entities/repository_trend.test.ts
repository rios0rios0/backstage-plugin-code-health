import type {
  ComplianceStatus,
  JiraRepositoryMetrics,
  RepositorySummary,
  RepositoryTrendPoint,
  SonarMetrics,
  WakaTimeProjectMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_JIRA_ISSUE_TYPES } from "@rios0rios0/backstage-plugin-code-health-common";
import {
  buildSuccessRateTrend,
  buildTrend,
  codeSmellTrend,
  codingTimeTrend,
  commitsTrend,
  complianceTrend,
  contributorsTrend,
  coverageTrend,
  defectTrend,
  jiraTrend,
  pullRequestTrend,
  releaseTrend,
  REPOSITORY_TREND_SERIES,
  reviewsPerMergeTrend,
  scoreTrend,
  technicalDebtTrend,
} from "../../../src/domain/entities/repository_trend";
import { RepositoryBuilder } from "../../builders/repository_builder";
import { aRepositoryTrendPoint } from "../../doubles/stub_trend_service";

const sonar = (overrides: Partial<SonarMetrics> = {}): SonarMetrics => ({
  bugs: 0,
  codeSmells: 0,
  securityHotspots: 0,
  vulnerabilities: 0,
  coverage: 0,
  duplications: 0,
  technicalDebt: "0min",
  technicalDebtMinutes: 0,
  qualityGateStatus: "OK",
  ...overrides,
});

const withSonar = (metrics: SonarMetrics | null): RepositorySummary => ({
  ...RepositoryBuilder.create().build(),
  sonarMetrics: metrics,
});

const compliance = (passing: Partial<ComplianceStatus>): ComplianceStatus => ({
  pipelineExists: false,
  buildPolicyOnPRs: false,
  buildPolicyExpiration: false,
  branchProtection: false,
  color: "red",
  ...passing,
});

const bucket = (summary: RepositorySummary): RepositoryTrendPoint =>
  aRepositoryTrendPoint("2026-08-03", summary);

describe("commitsTrend", () => {
  it("should carry the commits and the merges of each bucket", () => {
    // given
    const points = [
      bucket(
        RepositoryBuilder.create()
          .withActivity({ commits: 12, pullRequestsMerged: 3 })
          .build(),
      ),
    ];

    // when
    const result = commitsTrend(points);

    // then
    expect(result).toEqual([
      {
        day: "2026-08-03",
        values: { commits: 12, pullRequestsMerged: 3 },
      },
    ]);
  });

  it("should keep a genuinely empty bucket as a zero rather than a gap", () => {
    // given
    // A quiet week is a real measurement of zero. Turning it into a gap would
    // break the line exactly where the story is that nothing happened.
    const points = [bucket(RepositoryBuilder.create().build())];

    // when
    const result = commitsTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.commits]).toBe(0);
  });
});

describe("pullRequestTrend", () => {
  it("should carry opened against abandoned", () => {
    // given
    const points = [
      bucket(
        RepositoryBuilder.create()
          .withActivity({ pullRequestsOpened: 7, pullRequestsAbandoned: 2 })
          .build(),
      ),
    ];

    // when
    const result = pullRequestTrend(points);

    // then
    expect(result[0].values).toEqual({ pullRequestsOpened: 7, pullRequestsAbandoned: 2 });
  });
});

describe("buildTrend", () => {
  it("should carry the two verdicts of each bucket", () => {
    // given
    const points = [
      bucket(
        RepositoryBuilder.create()
          .withActivity({ builds: 9, buildsSucceeded: 6, buildsFailed: 1 })
          .build(),
      ),
    ];

    // when
    const result = buildTrend(points);

    // then
    expect(result[0].values).toEqual({ buildsSucceeded: 6, buildsFailed: 1 });
  });
});

describe("buildSuccessRateTrend", () => {
  it("should divide by the runs that reached a verdict", () => {
    // given
    // Two of the nine runs were cancelled by a newer push; they are neither a
    // success nor a failure, so they stay out of the denominator.
    const points = [
      bucket(
        RepositoryBuilder.create()
          .withActivity({ builds: 9, buildsSucceeded: 6, buildsFailed: 1 })
          .build(),
      ),
    ];

    // when
    const result = buildSuccessRateTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.buildSuccessRate]).toBe(85.7);
  });

  it("should leave a bucket where nothing reached a verdict unmeasured", () => {
    // given
    // Drawing this as 0% would report a week of superseded runs as a week of
    // red builds.
    const points = [bucket(RepositoryBuilder.create().withActivity({ builds: 4 }).build())];

    // when
    const result = buildSuccessRateTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.buildSuccessRate]).toBeNull();
  });
});

describe("reviewsPerMergeTrend", () => {
  it("should divide the reviews by the merges", () => {
    // given
    const points = [
      bucket(
        RepositoryBuilder.create()
          .withActivity({ reviews: 5, pullRequestsMerged: 2 })
          .build(),
      ),
    ];

    // when
    const result = reviewsPerMergeTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.reviewsPerMerge]).toBe(2.5);
  });

  it("should leave a bucket with nothing merged unmeasured", () => {
    // given
    // With no denominator the ratio says nothing: a week with one review and no
    // merge is not infinitely well reviewed.
    const points = [bucket(RepositoryBuilder.create().withActivity({ reviews: 1 }).build())];

    // when
    const result = reviewsPerMergeTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.reviewsPerMerge]).toBeNull();
  });
});

describe("contributorsTrend", () => {
  it("should carry the people who committed inside the bucket", () => {
    // given
    const points = [bucket(RepositoryBuilder.create().withActivity({ contributors: 4 }).build())];

    // when
    const result = contributorsTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.contributors]).toBe(4);
  });
});

describe("scoreTrend", () => {
  it("should carry the bucket's score", () => {
    // given
    const points = [bucket(withSonar(sonar({ coverage: 80, qualityGateStatus: "OK" })))];

    // when
    const result = scoreTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.score]).toBe(
      points[0].score.value,
    );
  });

  it("should leave a bucket nothing could be scored from unmeasured", () => {
    // given
    // Nothing was measured at all, so the score is unknown rather than nought.
    const points = [bucket(RepositoryBuilder.create().build())];

    // when
    const result = scoreTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.score]).toBeNull();
  });
});

describe("the Sonar series", () => {
  it("should carry bugs and vulnerabilities when Sonar measured them", () => {
    // given
    const points = [bucket(withSonar(sonar({ bugs: 3, vulnerabilities: 1 })))];

    // when
    const result = defectTrend(points);

    // then
    expect(result[0].values).toEqual({ bugs: 3, vulnerabilities: 1 });
  });

  it("should leave every Sonar figure unmeasured when there is no Sonar project", () => {
    // given
    // A repository with no Sonar project has an unknown quality, not a bad one.
    // Zeroes here would read as a flawless repository.
    const points = [bucket(withSonar(null))];

    // when / then
    expect(defectTrend(points)[0].values).toEqual({ bugs: null, vulnerabilities: null });
    expect(codeSmellTrend(points)[0].values[REPOSITORY_TREND_SERIES.codeSmells]).toBeNull();
    expect(coverageTrend(points)[0].values).toEqual({ coverage: null, duplications: null });
    expect(
      technicalDebtTrend(points)[0].values[REPOSITORY_TREND_SERIES.technicalDebtHours],
    ).toBeNull();
  });

  it("should keep a Sonar zero as a zero", () => {
    // given
    // Sonar answered, and the answer was none: that is a measurement.
    const points = [bucket(withSonar(sonar()))];

    // when
    const result = defectTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.bugs]).toBe(0);
  });

  it("should carry code smells and both percentages", () => {
    // given
    const points = [
      bucket(withSonar(sonar({ codeSmells: 42, coverage: 73.5, duplications: 4.25 }))),
    ];

    // when / then
    expect(codeSmellTrend(points)[0].values[REPOSITORY_TREND_SERIES.codeSmells]).toBe(42);
    expect(coverageTrend(points)[0].values).toEqual({ coverage: 73.5, duplications: 4.25 });
  });

  it("should report technical debt in hours", () => {
    // given
    // Sonar counts debt in minutes, which on a chart axis reads as a phone
    // number rather than as a duration.
    const points = [bucket(withSonar(sonar({ technicalDebtMinutes: 150 })))];

    // when
    const result = technicalDebtTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.technicalDebtHours]).toBe(2.5);
  });
});

describe("complianceTrend", () => {
  it("should count the checks that passed rather than read the colour", () => {
    // given
    // The colour buckets two failures and four into the same red, which is
    // exactly the difference a trend is asked to show.
    const points = [
      bucket({
        ...RepositoryBuilder.create().build(),
        complianceStatus: compliance({ pipelineExists: true, branchProtection: true }),
      }),
    ];

    // when
    const result = complianceTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.complianceChecks]).toBe(2);
  });

  it("should leave a bucket before the first snapshot unmeasured", () => {
    // given
    const points = [bucket(RepositoryBuilder.create().build())];

    // when
    const result = complianceTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.complianceChecks]).toBeNull();
  });
});

describe("releaseTrend", () => {
  it("should carry releases against tags", () => {
    // given
    const points = [
      bucket(RepositoryBuilder.create().withActivity({ releases: 1, tags: 4 }).build()),
    ];

    // when
    const result = releaseTrend(points);

    // then
    expect(result[0].values).toEqual({ releases: 1, tags: 4 });
  });
});

describe("codingTimeTrend", () => {
  it("should report WakaTime seconds as hours", () => {
    // given
    const wakaTime: WakaTimeProjectMetrics = {
      projectName: "gateway",
      window: { from: "2026-08-03", to: "2026-08-10" },
      totalSeconds: 9000,
      contributors: 2,
      daily: [],
    };
    const points = [
      bucket({ ...RepositoryBuilder.create().build(), wakaTimeMetrics: wakaTime }),
    ];

    // when
    const result = codingTimeTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.codingHours]).toBe(2.5);
  });

  it("should leave a bucket with no matching project unmeasured", () => {
    // given
    // Nobody logged time against a project this repository matches, which is
    // not the same as everybody having worked nought hours.
    const points = [bucket(RepositoryBuilder.create().build())];

    // when
    const result = codingTimeTrend(points);

    // then
    expect(result[0].values[REPOSITORY_TREND_SERIES.codingHours]).toBeNull();
  });
});

describe("jiraTrend", () => {
  it("should carry resolved against created", () => {
    // given
    const jira = {
      window: { from: "2026-08-03T00:00:00.000Z", to: "2026-08-10T00:00:00.000Z" },
      projectKey: "GW",
      component: null,
      issuesCreated: 9,
      issuesResolved: 6,
      throughputPerWeek: 6,
      resolvedByType: { ...EMPTY_JIRA_ISSUE_TYPES, bug: 2, story: 4 },
      bugRatio: 33.3,
      reopened: 0,
      cycleTime: null,
      leadTime: null,
      storyPointsEstimated: null,
      storyPointsCompleted: null,
      openIssues: 12,
      oldestOpenIssue: null,
      openByPriority: [],
      contributors: 3,
    } as JiraRepositoryMetrics;
    const points = [bucket({ ...RepositoryBuilder.create().build(), jiraMetrics: jira })];

    // when
    const result = jiraTrend(points);

    // then
    expect(result[0].values).toEqual({ issuesResolved: 6, issuesCreated: 9 });
  });

  it("should leave a bucket with no matching project unmeasured", () => {
    // given
    const points = [bucket(RepositoryBuilder.create().build())];

    // when
    const result = jiraTrend(points);

    // then
    expect(result[0].values).toEqual({ issuesResolved: null, issuesCreated: null });
  });
});

describe("a window whose measurement starts partway through", () => {
  it("should break the Sonar line rather than bridge it", () => {
    // given
    // Sonar was wired up between the two buckets. Reading the first as zero
    // would draw a quality collapse followed by a recovery that never happened.
    const points = [
      aRepositoryTrendPoint("2026-08-03", withSonar(null)),
      aRepositoryTrendPoint("2026-08-10", withSonar(sonar({ coverage: 64 }))),
    ];

    // when
    const result = coverageTrend(points);

    // then
    expect(result.map((point) => point.values[REPOSITORY_TREND_SERIES.coverage])).toEqual([
      null,
      64,
    ]);
  });
});

describe("every series", () => {
  it("should return nothing at all for a window with no buckets", () => {
    // given
    const points: RepositoryTrendPoint[] = [];

    // when / then
    expect(commitsTrend(points)).toEqual([]);
    expect(scoreTrend(points)).toEqual([]);
  });
});
