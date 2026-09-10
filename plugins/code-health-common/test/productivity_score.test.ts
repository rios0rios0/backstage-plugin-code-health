import type {
  ConfluenceContributorMetrics,
  ContributorSummary,
  IntegrationCapabilities,
  JiraContributorMetrics,
  SonarMetrics,
  WakaTimeMetrics,
} from "../src";
import {
  EMPTY_JIRA_INTERACTIONS,
  EMPTY_JIRA_ISSUE_TYPES,
  NO_INTEGRATIONS,
} from "../src";
import {
  computeProductivityScore,
  EMPTY_FLEET_REFERENCE,
  fleetReferenceOf,
  PRODUCTIVITY_COMPONENTS,
  productivityComponentsFor,
} from "../src/productivity_score";
import { WakaTimeMetricsBuilder } from "./builders/wakatime_metrics_builder";

const aContributor = (overrides: Partial<ContributorSummary> = {}): ContributorSummary => ({
  key: "vcs:jane",
  displayName: "Jane",
  avatarUrl: null,
  profileUrl: null,
  entityRef: null,
  identities: [{ source: "vcs", sourceKey: "jane", displayName: "Jane" }],
  commits: 10,
  linesAdded: 500,
  linesDeleted: 100,
  linesOfCode: 400,
  changedFiles: 0,
  churnUnit: "lines",
  pullRequestsOpened: 4,
  pullRequestsMerged: 4,
  reviewsGiven: 6,
  reviewsApproved: 5,
  reviewsRejected: 1,
  prApprovalRate: 83.3,
  pipelineRuns: 10,
  pipelineRunsSucceeded: 8,
  pipelineRunsFailed: 2,
  pipelineSuccessRate: 80,
  repositories: 2,
  sonarMetrics: null,
  wakaTimeMetrics: null,
  jiraMetrics: null,
  confluenceMetrics: null,
  ...overrides,
});

const sonar = (overrides: Partial<SonarMetrics> = {}): SonarMetrics => ({
  bugs: 0,
  codeSmells: 0,
  securityHotspots: 0,
  vulnerabilities: 0,
  coverage: 40,
  duplications: 0,
  technicalDebt: "0min",
  technicalDebtMinutes: 0,
  qualityGateStatus: "OK",
  ...overrides,
});

const wakaTime = (totalSeconds: number): WakaTimeMetrics =>
  WakaTimeMetricsBuilder.aDay().withSeconds(totalSeconds).build();

const jira = (overrides: Partial<JiraContributorMetrics> = {}): JiraContributorMetrics => ({
  window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" },
  issuesCreated: 0,
  issuesResolved: 0,
  interactions: EMPTY_JIRA_INTERACTIONS,
  storyPointsEstimated: null,
  storyPointsCompleted: null,
  cycleTime: null,
  leadTime: null,
  resolvedByType: EMPTY_JIRA_ISSUE_TYPES,
  reopened: 0,
  ...overrides,
});

const confluence = (
  overrides: Partial<ConfluenceContributorMetrics> = {},
): ConfluenceContributorMetrics => ({
  window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" },
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

const WAKATIME_ONLY: IntegrationCapabilities = { ...NO_INTEGRATIONS, wakatime: true };
const JIRA_ONLY: IntegrationCapabilities = { ...NO_INTEGRATIONS, jira: true };
const CONFLUENCE_ONLY: IntegrationCapabilities = { ...NO_INTEGRATIONS, confluence: true };
const EVERYTHING: IntegrationCapabilities = {
  wakatime: true,
  jira: true,
  confluence: true,
};

const componentById = (
  score: ReturnType<typeof computeProductivityScore>,
  id: string,
) => score.components.find((component) => component.id === id);

const idsOf = (score: ReturnType<typeof computeProductivityScore>): string[] =>
  score.components.map((component) => component.id);

describe("fleetReferenceOf", () => {
  it("should take the top figure of every relative component", () => {
    // given
    const contributors = [
      aContributor({ commits: 3, pullRequestsMerged: 9, reviewsGiven: 1, linesOfCode: 50 }),
      aContributor({ commits: 12, pullRequestsMerged: 2, reviewsGiven: 7, linesOfCode: 900 }),
    ];

    // when
    const reference = fleetReferenceOf(contributors);

    // then
    expect(reference).toEqual({
      commits: 12,
      pullRequestsMerged: 9,
      reviewsGiven: 7,
      linesOfCode: 900,
      changedFiles: 0,
      codingSeconds: 0,
      issuesResolved: 0,
      documentationContributions: 0,
    });
  });

  it("should keep churn per unit so files never compete with lines", () => {
    // given
    const contributors = [
      aContributor({ churnUnit: "files", changedFiles: 30, linesOfCode: 0 }),
      aContributor({ churnUnit: "lines", linesOfCode: 400, changedFiles: 0 }),
      aContributor({ churnUnit: "none", linesOfCode: 9999, changedFiles: 9999 }),
    ];

    // when
    const reference = fleetReferenceOf(contributors);

    // then
    // The `none` row reports figures the provider never gave, so they are not
    // a reference for anybody.
    expect(reference.linesOfCode).toBe(400);
    expect(reference.changedFiles).toBe(30);
  });

  it("should take the top integration figure, skipping the rows nothing was asked for", () => {
    // given
    // A row with no metrics is an account nobody linked, not somebody who
    // recorded nothing — it takes no part in the maximum either way, but the
    // two have to stay distinguishable further down.
    const contributors = [
      aContributor({
        wakaTimeMetrics: wakaTime(7200),
        jiraMetrics: jira({ issuesResolved: 4 }),
        confluenceMetrics: confluence({ pagesCreated: 2, commentsWritten: 3 }),
      }),
      aContributor({
        wakaTimeMetrics: wakaTime(1800),
        jiraMetrics: jira({ issuesResolved: 11 }),
        confluenceMetrics: confluence({ attachmentsAdded: 1 }),
      }),
      aContributor(),
    ];

    // when
    const reference = fleetReferenceOf(contributors);

    // then
    expect(reference.codingSeconds).toBe(7200);
    expect(reference.issuesResolved).toBe(11);
    expect(reference.documentationContributions).toBe(5);
  });

  it("should be empty for nobody", () => {
    // given / when / then
    expect(fleetReferenceOf([])).toEqual(EMPTY_FLEET_REFERENCE);
  });
});

describe("productivityComponentsFor", () => {
  it("should weight the components to one whatever is configured", () => {
    // given
    // Three independent flags is exactly what the backend can be configured
    // with, so all eight readings of it are enumerated rather than sampled.
    const combinations: IntegrationCapabilities[] = [false, true].flatMap((wakatime) =>
      [false, true].flatMap((jiraOn) =>
        [false, true].map((confluenceOn) => ({
          wakatime,
          jira: jiraOn,
          confluence: confluenceOn,
        })),
      ),
    );

    // when
    const totals = combinations.map((capabilities) =>
      productivityComponentsFor(capabilities).reduce(
        (sum, definition) => sum + definition.weight,
        0,
      ),
    );

    // then
    expect(totals).toHaveLength(8);
    for (const total of totals) {
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("should leave the nominal weights adding up to more than one", () => {
    // given / when
    const nominal = Object.values(PRODUCTIVITY_COMPONENTS).reduce(
      (sum, component) => sum + component.weight,
      0,
    );

    // then
    // The nominal figures say what each component is worth against the others,
    // not against a total — which is the whole reason they can be renormalised.
    expect(nominal).toBeCloseTo(1.4, 10);
  });

  it("should share a component's weight out over what is configured", () => {
    // given / when
    const alone = productivityComponentsFor();
    const everything = productivityComponentsFor(EVERYTHING);

    // then
    // Commits are worth a fifth of a score built on code alone, and about a
    // seventh once three more systems are being read alongside it.
    expect(alone.find((definition) => definition.id === "commits")?.weight).toBe(0.2);
    expect(everything.find((definition) => definition.id === "commits")?.weight).toBeCloseTo(
      0.2 / 1.4,
      10,
    );
  });

  it("should offer only the components the configured integrations bring", () => {
    // given / when
    const ids = (capabilities?: IntegrationCapabilities) =>
      productivityComponentsFor(capabilities).map((definition) => definition.id);

    // then
    expect(ids()).not.toContain("codingTime");
    expect(ids(WAKATIME_ONLY)).toContain("codingTime");
    expect(ids(WAKATIME_ONLY)).not.toContain("ticketsResolved");
    expect(ids(JIRA_ONLY)).toEqual(expect.arrayContaining(["ticketsResolved", "reopened"]));
    expect(ids(CONFLUENCE_ONLY)).toContain("documentation");
    expect(ids(EVERYTHING)).toHaveLength(11);
  });
});

describe("computeProductivityScore", () => {
  it("should score an install with no integration exactly as it did before there were any", () => {
    // given
    const contributor = aContributor({ sonarMetrics: sonar({ coverage: 80 }) });
    const reference = fleetReferenceOf([contributor]);

    // when
    const score = computeProductivityScore(contributor, reference);

    // then
    // The seven original components at the seven original weights: switching
    // nothing on has to leave the number, and its workings, where they were.
    expect(score.components.map(({ id, weight }) => [id, weight])).toEqual([
      ["commits", 0.2],
      ["pullRequestsMerged", 0.2],
      ["churn", 0.1],
      ["reviewsGiven", 0.15],
      ["pipelineSuccessRate", 0.15],
      ["qualityGate", 0.1],
      ["coverage", 0.1],
    ]);
    // 0.8 on the pipeline is the only component below one.
    expect(score.value).toBe(97);
    expect(score.evidence).toBe(1);
  });

  it("should give the fleet's top performer full marks on every relative component", () => {
    // given
    const contributor = aContributor({ sonarMetrics: sonar({ coverage: 80 }) });
    const reference = fleetReferenceOf([contributor]);

    // when
    const score = computeProductivityScore(contributor, reference);

    // then
    expect(componentById(score, "commits")?.normalized).toBe(1);
    expect(componentById(score, "churn")?.normalized).toBe(1);
  });

  it("should read output as a share of the fleet's top figure", () => {
    // given
    const contributor = aContributor({ commits: 5, pullRequestsMerged: 1, reviewsGiven: 0 });
    const reference = { ...EMPTY_FLEET_REFERENCE, commits: 20, pullRequestsMerged: 4, reviewsGiven: 8, linesOfCode: 800 };

    // when
    const score = computeProductivityScore(contributor, reference);

    // then
    expect(componentById(score, "commits")).toMatchObject({
      value: 5,
      normalized: 0.25,
      detail: "5 commits against the window's top figure of 20",
    });
    expect(componentById(score, "reviewsGiven")).toMatchObject({ value: 0, normalized: 0 });
    expect(componentById(score, "churn")?.normalized).toBe(0.5);
  });

  it("should leave a relative component unmeasured when nobody recorded any", () => {
    // given
    const contributor = aContributor({ reviewsGiven: 0 });
    const reference = { ...fleetReferenceOf([contributor]), reviewsGiven: 0 };

    // when
    const score = computeProductivityScore(contributor, reference);

    // then
    // A week with no review anywhere says nothing about anyone.
    expect(componentById(score, "reviewsGiven")).toMatchObject({
      normalized: null,
      detail: "nobody recorded any reviews in this window",
    });
  });

  it("should compare file churn with file churn", () => {
    // given
    const contributor = aContributor({ churnUnit: "files", changedFiles: 15, linesOfCode: 0 });
    const reference = { ...EMPTY_FLEET_REFERENCE, commits: 10, changedFiles: 30, linesOfCode: 5000 };

    // when
    const score = computeProductivityScore(contributor, reference);

    // then
    expect(componentById(score, "churn")).toMatchObject({
      value: 15,
      normalized: 0.5,
      detail: "15 changed files against the window's top figure of 30",
    });
  });

  it("should leave churn unmeasured when the provider reported none", () => {
    // given
    const contributor = aContributor({ churnUnit: "none" });

    // when
    const score = computeProductivityScore(contributor, fleetReferenceOf([contributor]));

    // then
    expect(componentById(score, "churn")?.normalized).toBeNull();
  });

  it("should read the pipeline over decided runs and leave it unmeasured with none", () => {
    // given
    const decided = aContributor({ pipelineRunsSucceeded: 3, pipelineRunsFailed: 1, pipelineSuccessRate: 75 });
    const undecided = aContributor({ pipelineRuns: 4, pipelineRunsSucceeded: 0, pipelineRunsFailed: 0, pipelineSuccessRate: 0 });

    // when
    const decidedScore = computeProductivityScore(decided, fleetReferenceOf([decided]));
    const undecidedScore = computeProductivityScore(undecided, fleetReferenceOf([undecided]));

    // then
    expect(componentById(decidedScore, "pipelineSuccessRate")).toMatchObject({
      value: 75,
      normalized: 0.75,
      detail: "3 of 4 decided runs succeeded",
    });
    // Four cancelled runs are not four failures.
    expect(componentById(undecidedScore, "pipelineSuccessRate")?.normalized).toBeNull();
  });

  it("should score the quality gate and coverage of the code touched", () => {
    // given
    const failing = aContributor({ sonarMetrics: sonar({ qualityGateStatus: "ERROR", coverage: 40 }) });

    // when
    const score = computeProductivityScore(failing, fleetReferenceOf([failing]));

    // then
    expect(componentById(score, "qualityGate")).toMatchObject({ value: 0, normalized: 0 });
    // Forty against the eighty percent gate is half way there.
    expect(componentById(score, "coverage")).toMatchObject({ value: 40, normalized: 0.5 });
  });

  it("should leave Sonar components unmeasured without a project or a gate", () => {
    // given
    const unmeasured = aContributor({ sonarMetrics: null });
    const noGate = aContributor({ sonarMetrics: sonar({ qualityGateStatus: "NONE" }) });

    // when
    const unmeasuredScore = computeProductivityScore(unmeasured, fleetReferenceOf([unmeasured]));
    const noGateScore = computeProductivityScore(noGate, fleetReferenceOf([noGate]));

    // then
    expect(componentById(unmeasuredScore, "qualityGate")?.normalized).toBeNull();
    expect(componentById(unmeasuredScore, "coverage")?.normalized).toBeNull();
    expect(componentById(noGateScore, "qualityGate")?.normalized).toBeNull();
    expect(componentById(noGateScore, "coverage")?.normalized).toBe(0.5);
  });

  it("should have no score for somebody nothing measured", () => {
    // given
    const idle = aContributor({
      commits: 0,
      pullRequestsMerged: 0,
      reviewsGiven: 0,
      churnUnit: "none",
      pipelineRunsSucceeded: 0,
      pipelineRunsFailed: 0,
    });

    // when
    const score = computeProductivityScore(idle, EMPTY_FLEET_REFERENCE);

    // then
    expect(score.value).toBeNull();
    expect(score.evidence).toBe(0);
  });

  it("should score only the integrations that are configured, never the ones a row carries", () => {
    // given
    // The row holds all three measures. Whether they count is a question about
    // the backend's configuration, and a row that happens to carry a value
    // cannot answer it — an integration switched off collected these on some
    // earlier run, and one switched on may not have run yet.
    const contributor = aContributor({
      wakaTimeMetrics: wakaTime(3600),
      jiraMetrics: jira({ issuesResolved: 4 }),
      confluenceMetrics: confluence({ pagesCreated: 3 }),
    });
    const reference = fleetReferenceOf([contributor]);

    // when
    const off = computeProductivityScore(contributor, reference);
    const jiraOn = computeProductivityScore(contributor, reference, JIRA_ONLY);

    // then
    expect(idsOf(off)).not.toEqual(
      expect.arrayContaining(["codingTime", "ticketsResolved", "reopened", "documentation"]),
    );
    expect(idsOf(jiraOn)).toEqual(expect.arrayContaining(["ticketsResolved", "reopened"]));
    expect(idsOf(jiraOn)).not.toContain("codingTime");
    expect(idsOf(jiraOn)).not.toContain("documentation");
  });

  it("should read coding time against the window's top figure", () => {
    // given
    const contributor = aContributor({ wakaTimeMetrics: wakaTime(5400) });
    const reference = { ...fleetReferenceOf([contributor]), codingSeconds: 9000 };

    // when
    const score = computeProductivityScore(contributor, reference, WAKATIME_ONLY);

    // then
    expect(componentById(score, "codingTime")).toMatchObject({
      value: 5400,
      normalized: 0.6,
      detail: "1h 30m against the window's top figure of 2h 30m",
    });
  });

  it("should leave coding time unmeasured for an account nobody has linked", () => {
    // given
    const contributor = aContributor({ wakaTimeMetrics: null });

    // when
    const score = computeProductivityScore(
      contributor,
      { ...fleetReferenceOf([contributor]), codingSeconds: 9000 },
      WAKATIME_ONLY,
    );

    // then
    // Naming the cause is what makes it fixable: it is one link away on the
    // Identities screen, unlike every other reason a figure can be missing.
    expect(componentById(score, "codingTime")).toMatchObject({
      normalized: null,
      detail: "no WakaTime account is linked to this person",
    });
  });

  it("should leave coding time unmeasured when nobody in the fleet logged any", () => {
    // given
    const contributor = aContributor({ wakaTimeMetrics: wakaTime(0) });

    // when
    const score = computeProductivityScore(
      contributor,
      fleetReferenceOf([contributor]),
      WAKATIME_ONLY,
    );

    // then
    expect(componentById(score, "codingTime")).toMatchObject({
      normalized: null,
      detail: "nobody recorded any coding time in this window",
    });
  });

  it("should read resolved tickets against the window's top figure", () => {
    // given
    const contributor = aContributor({ jiraMetrics: jira({ issuesResolved: 3 }) });
    const reference = { ...fleetReferenceOf([contributor]), issuesResolved: 6 };

    // when
    const score = computeProductivityScore(contributor, reference, JIRA_ONLY);

    // then
    expect(componentById(score, "ticketsResolved")).toMatchObject({
      value: 3,
      normalized: 0.5,
      detail: "3 resolved tickets against the window's top figure of 6",
    });
  });

  it("should leave both Jira components unmeasured for an account nobody has linked", () => {
    // given
    const contributor = aContributor({ jiraMetrics: null });
    const reference = { ...fleetReferenceOf([contributor]), issuesResolved: 6 };

    // when
    const score = computeProductivityScore(contributor, reference, JIRA_ONLY);

    // then
    expect(componentById(score, "ticketsResolved")).toMatchObject({
      normalized: null,
      detail: "no Jira account is linked to this person",
    });
    expect(componentById(score, "reopened")).toMatchObject({
      normalized: null,
      detail: "no Jira account is linked to this person",
    });
  });

  it("should leave resolved tickets unmeasured when nobody in the fleet resolved any", () => {
    // given
    const contributor = aContributor({ jiraMetrics: jira() });

    // when
    const score = computeProductivityScore(
      contributor,
      fleetReferenceOf([contributor]),
      JIRA_ONLY,
    );

    // then
    expect(componentById(score, "ticketsResolved")).toMatchObject({
      normalized: null,
      detail: "nobody recorded any resolved tickets in this window",
    });
  });

  it("should score reopened tickets against this person's own resolved ones", () => {
    // given
    // Absolute, unlike everything else Jira contributes: a ticket coming back
    // is a fact about that ticket rather than a race against other people's.
    const contributor = aContributor({
      jiraMetrics: jira({ issuesResolved: 6, reopened: 1 }),
    });

    // when
    const score = computeProductivityScore(
      contributor,
      { ...fleetReferenceOf([contributor]), issuesResolved: 60 },
      JIRA_ONLY,
    );

    // then
    expect(componentById(score, "reopened")).toMatchObject({
      value: 1,
      normalized: 0.8333,
      detail: "1 of 6 resolved tickets was reopened",
    });
  });

  it("should floor reopened tickets at zero rather than below it", () => {
    // given
    // More reopenings than resolutions is ordinary — a ticket can come back
    // twice, and one resolved before the window can come back inside it.
    const contributor = aContributor({
      jiraMetrics: jira({ issuesResolved: 2, reopened: 5 }),
    });

    // when
    const score = computeProductivityScore(
      contributor,
      fleetReferenceOf([contributor]),
      JIRA_ONLY,
    );

    // then
    expect(componentById(score, "reopened")).toMatchObject({
      normalized: 0,
      detail: "5 of 2 resolved tickets were reopened",
    });
  });

  it("should leave reopened tickets unmeasured for somebody who resolved none", () => {
    // given
    const contributor = aContributor({ jiraMetrics: jira({ issuesResolved: 0 }) });

    // when
    const score = computeProductivityScore(
      contributor,
      { ...fleetReferenceOf([contributor]), issuesResolved: 9 },
      JIRA_ONLY,
    );

    // then
    // Closing no ticket is not the same as failing to keep one closed.
    expect(componentById(score, "reopened")).toMatchObject({
      normalized: null,
      detail: "no ticket resolved",
    });
  });

  it("should read documentation against the window's top figure", () => {
    // given
    // Pages, versions, blog posts, comments and attachments together — writing
    // a page and answering three questions on somebody else's both count.
    const contributor = aContributor({
      confluenceMetrics: confluence({ pagesCreated: 2, commentsWritten: 3 }),
    });
    const reference = { ...fleetReferenceOf([contributor]), documentationContributions: 10 };

    // when
    const score = computeProductivityScore(contributor, reference, CONFLUENCE_ONLY);

    // then
    expect(componentById(score, "documentation")).toMatchObject({
      value: 5,
      normalized: 0.5,
      detail: "5 Confluence contributions against the window's top figure of 10",
    });
  });

  it("should leave documentation unmeasured for an account nobody has linked", () => {
    // given
    const contributor = aContributor({ confluenceMetrics: null });
    const reference = { ...fleetReferenceOf([contributor]), documentationContributions: 10 };

    // when
    const score = computeProductivityScore(contributor, reference, CONFLUENCE_ONLY);

    // then
    expect(componentById(score, "documentation")).toMatchObject({
      normalized: null,
      detail: "no Confluence account is linked to this person",
    });
  });

  it("should leave documentation unmeasured when nobody in the fleet wrote any", () => {
    // given
    const contributor = aContributor({ confluenceMetrics: confluence() });

    // when
    const score = computeProductivityScore(
      contributor,
      fleetReferenceOf([contributor]),
      CONFLUENCE_ONLY,
    );

    // then
    expect(componentById(score, "documentation")).toMatchObject({
      normalized: null,
      detail: "nobody recorded any Confluence contributions in this window",
    });
  });

  it("should weigh every component less once the integrations join the score", () => {
    // given
    const contributor = aContributor({
      sonarMetrics: sonar({ coverage: 80 }),
      wakaTimeMetrics: wakaTime(3600),
      jiraMetrics: jira({ issuesResolved: 4, reopened: 0 }),
      confluenceMetrics: confluence({ pagesCreated: 5 }),
    });
    const reference = fleetReferenceOf([contributor]);

    // when
    const score = computeProductivityScore(contributor, reference, EVERYTHING);

    // then
    expect(score.components).toHaveLength(11);
    expect(componentById(score, "commits")?.weight).toBeCloseTo(0.2 / 1.4, 10);
    expect(componentById(score, "codingTime")?.normalized).toBe(1);
    expect(componentById(score, "reopened")?.normalized).toBe(1);
    expect(score.evidence).toBe(1);
  });
});
