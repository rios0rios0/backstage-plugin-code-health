import type { ContributorSummary, SonarMetrics } from "../src";
import {
  computeProductivityScore,
  EMPTY_FLEET_REFERENCE,
  fleetReferenceOf,
  PRODUCTIVITY_COMPONENTS,
} from "../src/productivity_score";

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

const componentById = (
  score: ReturnType<typeof computeProductivityScore>,
  id: string,
) => score.components.find((component) => component.id === id);

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

  it("should be empty for nobody", () => {
    // given / when / then
    expect(fleetReferenceOf([])).toEqual(EMPTY_FLEET_REFERENCE);
  });
});

describe("computeProductivityScore", () => {
  it("should weight the components to one", () => {
    // given / when
    const total = Object.values(PRODUCTIVITY_COMPONENTS).reduce(
      (sum, component) => sum + component.weight,
      0,
    );

    // then
    expect(total).toBeCloseTo(1, 10);
  });

  it("should give the fleet's top performer full marks on every relative component", () => {
    // given
    const contributor = aContributor({ sonarMetrics: sonar({ coverage: 80 }) });
    const reference = fleetReferenceOf([contributor]);

    // when
    const score = computeProductivityScore(contributor, reference);

    // then
    // 0.8 on the pipeline is the only component below one.
    expect(score.value).toBe(97);
    expect(score.evidence).toBe(1);
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
});
