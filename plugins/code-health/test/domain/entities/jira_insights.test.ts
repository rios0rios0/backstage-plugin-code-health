import type {
  JiraContributorMetrics,
  JiraRepositoryMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_JIRA_INTERACTIONS, EMPTY_JIRA_ISSUE_TYPES } from "@rios0rios0/backstage-plugin-code-health-common";
import {
  distinctJiraProjects,
  hasJiraMetrics,
  jiraFleetStats,
  jiraFlowBreakdown,
  jiraOpenPriorityRanking,
  jiraResolvedByType,
  staleJiraBacklog,
  topJiraContributorsByInteractions,
  topJiraContributorsByResolved,
} from "../../../src/domain/entities/jira_insights";
import { ContributorBuilder } from "../../builders/contributor_builder";
import { RepositoryBuilder } from "../../builders/repository_builder";

const WINDOW = { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" };

const projectMetrics = (
  overrides: Partial<JiraRepositoryMetrics> = {},
): JiraRepositoryMetrics => ({
  window: WINDOW,
  projectKey: "PLAT",
  component: null,
  issuesCreated: 0,
  issuesResolved: 0,
  throughputPerWeek: null,
  resolvedByType: EMPTY_JIRA_ISSUE_TYPES,
  bugRatio: null,
  reopened: 0,
  cycleTime: null,
  leadTime: null,
  storyPointsEstimated: null,
  storyPointsCompleted: null,
  openIssues: null,
  oldestOpenIssue: null,
  openByPriority: [],
  contributors: 0,
  ...overrides,
});

const personMetrics = (
  overrides: Partial<JiraContributorMetrics> = {},
): JiraContributorMetrics => ({
  window: WINDOW,
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

const aRepository = (name: string, metrics: JiraRepositoryMetrics | null) => ({
  ...RepositoryBuilder.create().withId(name).build(),
  name,
  jiraMetrics: metrics,
});

const aContributor = (name: string, metrics: JiraContributorMetrics | null) => ({
  ...ContributorBuilder.create().withDisplayName(name).build(),
  jiraMetrics: metrics,
});

describe("distinctJiraProjects", () => {
  it("should count a project named by several repositories exactly once", () => {
    // given
    // The backend measures a project once and hands the same answer to every
    // repository that names it. Adding across rows would report a team closing
    // four times the tickets it closed.
    const shared = projectMetrics({ projectKey: "PLAT", issuesResolved: 10 });
    const repositories = [
      aRepository("gateway", shared),
      aRepository("worker", shared),
      aRepository("docs", projectMetrics({ projectKey: "DOCS", issuesResolved: 3 })),
    ];

    // when
    const projects = distinctJiraProjects(repositories);

    // then
    expect(projects).toHaveLength(2);
    expect(
      projects.map((project) => project.issuesResolved).sort((left, right) => left - right),
    ).toEqual([3, 10]);
  });

  it("should keep two components of one project apart", () => {
    // given
    // A repository scoped to a component is measuring a genuinely narrower
    // slice, so the two are different measurements of different things.
    const repositories = [
      aRepository("a", projectMetrics({ component: "gateway", issuesResolved: 2 })),
      aRepository("b", projectMetrics({ component: "worker", issuesResolved: 5 })),
    ];

    // when
    const projects = distinctJiraProjects(repositories);

    // then
    expect(projects).toHaveLength(2);
  });

  it("should fold case, so one project reached two ways is one project", () => {
    // given
    const repositories = [
      aRepository("a", projectMetrics({ projectKey: "plat", component: "Gateway" })),
      aRepository("b", projectMetrics({ projectKey: "PLAT", component: "gateway" })),
    ];

    // when
    const projects = distinctJiraProjects(repositories);

    // then
    expect(projects).toHaveLength(1);
  });

  it("should ignore repositories with no Jira measurement", () => {
    // given
    const repositories = [aRepository("a", null)];

    // when
    const projects = distinctJiraProjects(repositories);

    // then
    expect(projects).toEqual([]);
  });
});

describe("hasJiraMetrics", () => {
  it("should be true when either side carries a measurement", () => {
    // given
    const onlyRepositories = {
      repositories: [aRepository("a", projectMetrics())],
      contributors: [aContributor("dev", null)],
    };
    const onlyPeople = {
      repositories: [aRepository("a", null)],
      contributors: [aContributor("dev", personMetrics())],
    };
    const neither = {
      repositories: [aRepository("a", null)],
      contributors: [aContributor("dev", null)],
    };

    // when
    const flags = [onlyRepositories, onlyPeople, neither].map((input) =>
      hasJiraMetrics(input.repositories, input.contributors),
    );

    // then
    expect(flags).toEqual([true, true, false]);
  });
});

describe("jiraFleetStats", () => {
  it("should compute a mean cycle time over the union rather than an average of medians", () => {
    // given
    // No arithmetic recovers a fleet median from a list of project medians, but
    // the totals beside them add up exactly.
    const repositories = [
      aRepository(
        "a",
        projectMetrics({
          projectKey: "A",
          issuesResolved: 1,
          cycleTime: { totalHours: 10, issues: 1, medianHours: 10, p85Hours: 10 },
          leadTime: { totalHours: 20, issues: 1, medianHours: 20, p85Hours: 20 },
        }),
      ),
      aRepository(
        "b",
        projectMetrics({
          projectKey: "B",
          issuesResolved: 3,
          cycleTime: { totalHours: 30, issues: 3, medianHours: 9, p85Hours: 14 },
          leadTime: { totalHours: 60, issues: 3, medianHours: 19, p85Hours: 24 },
        }),
      ),
    ];

    // when
    const stats = jiraFleetStats(repositories, []);

    // then
    expect(stats.meanCycleHours).toBe(10);
    expect(stats.meanLeadHours).toBe(20);
    expect(stats.issuesResolved).toBe(4);
  });

  it("should sum throughput across projects rather than averaging it", () => {
    // given
    // Each project's rate is tickets per week, and the fleet ships the sum of
    // what its projects ship.
    const repositories = [
      aRepository("a", projectMetrics({ projectKey: "A", throughputPerWeek: 2.5 })),
      aRepository("b", projectMetrics({ projectKey: "B", throughputPerWeek: 4 })),
    ];

    // when
    const stats = jiraFleetStats(repositories, []);

    // then
    expect(stats.throughputPerWeek).toBe(6.5);
  });

  it("should keep a nullable total null only when no project measured it", () => {
    // given
    // One project with a story-point field and one without is a fleet that
    // completed at least the points the first one reports.
    const measured = [
      aRepository("a", projectMetrics({ projectKey: "A", storyPointsCompleted: 8 })),
      aRepository("b", projectMetrics({ projectKey: "B", storyPointsCompleted: null })),
    ];
    const neither = [
      aRepository("a", projectMetrics({ projectKey: "A", storyPointsCompleted: null })),
    ];

    // when
    const withOne = jiraFleetStats(measured, []);
    const withNone = jiraFleetStats(neither, []);

    // then
    expect(withOne.storyPointsCompleted).toBe(8);
    expect(withNone.storyPointsCompleted).toBeNull();
    expect(withNone.openIssues).toBeNull();
  });

  it("should add two measured totals rather than taking one of them", () => {
    // given
    const repositories = [
      aRepository("a", projectMetrics({ projectKey: "A", openIssues: 4, storyPointsCompleted: 3 })),
      aRepository("b", projectMetrics({ projectKey: "B", openIssues: 6, storyPointsCompleted: 5 })),
    ];

    // when
    const stats = jiraFleetStats(repositories, []);

    // then
    expect(stats.openIssues).toBe(10);
    expect(stats.storyPointsCompleted).toBe(8);
  });

  it("should report the bug ratio over the fleet's whole closed workload", () => {
    // given
    const repositories = [
      aRepository(
        "a",
        projectMetrics({
          projectKey: "A",
          resolvedByType: { ...EMPTY_JIRA_ISSUE_TYPES, bug: 1, story: 1 },
        }),
      ),
      aRepository(
        "b",
        projectMetrics({
          projectKey: "B",
          resolvedByType: { ...EMPTY_JIRA_ISSUE_TYPES, bug: 1, task: 5 },
        }),
      ),
    ];

    // when
    const stats = jiraFleetStats(repositories, []);
    const byType = jiraResolvedByType(repositories);

    // then
    expect(stats.bugRatio).toBe(25);
    expect(byType).toEqual({
      counts: { ...EMPTY_JIRA_ISSUE_TYPES, bug: 2, story: 1, task: 5 },
      total: 8,
    });
  });

  it("should count people by whether Jira measured them, not by whether they committed", () => {
    // given
    const contributors = [
      aContributor("dev", personMetrics({ issuesResolved: 2 })),
      aContributor("designer", null),
    ];

    // when
    const stats = jiraFleetStats([], contributors);

    // then
    expect(stats.people).toBe(1);
    expect(stats.projects).toBe(0);
    expect(stats.bugRatio).toBeNull();
    expect(stats.throughputPerWeek).toBeNull();
  });
});

describe("topJiraContributorsByResolved", () => {
  it("should rank by tickets closed and drop anyone who closed nothing", () => {
    // given
    // A chart claiming a top five when only two people closed anything reads as
    // five people, three of whom did nothing.
    const contributors = [
      aContributor("closer", personMetrics({ issuesResolved: 9, issuesCreated: 2 })),
      aContributor("raiser", personMetrics({ issuesResolved: 0, issuesCreated: 12 })),
      aContributor("committer", null),
    ];

    // when
    const ranking = topJiraContributorsByResolved(contributors);

    // then
    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ label: "closer", value: 9, detail: "2 raised" });
  });
  it("should break a tie on the name so the ranking does not reshuffle between requests", () => {
    // given
    // An order that changes under the cursor is how somebody reads the wrong
    // row.
    const contributors = [
      aContributor("zoe", personMetrics({ issuesResolved: 4 })),
      aContributor("adam", personMetrics({ issuesResolved: 4 })),
    ];

    // when
    const ranking = topJiraContributorsByResolved(contributors);

    // then
    expect(ranking.map((item) => item.label)).toEqual(["adam", "zoe"]);
  });
});

describe("topJiraContributorsByInteractions", () => {
  it("should rank the work that closes nothing", () => {
    // given
    // The person who triages, comments and keeps the board honest can close
    // almost nothing and still be the reason the project moves.
    const contributors = [
      aContributor(
        "triager",
        personMetrics({
          interactions: { comments: 30, worklogEntries: 2, transitions: 40, truncatedIssues: 0 },
        }),
      ),
      aContributor("quiet", personMetrics()),
    ];

    // when
    const ranking = topJiraContributorsByInteractions(contributors);

    // then
    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ value: 72, detail: "40 transitions" });
  });
});

describe("jiraFlowBreakdown", () => {
  it("should separate projects that keep up from those that fall behind", () => {
    // given
    const repositories = [
      aRepository("a", projectMetrics({ projectKey: "A", issuesCreated: 3, issuesResolved: 5 })),
      aRepository("b", projectMetrics({ projectKey: "B", issuesCreated: 9, issuesResolved: 1 })),
      aRepository("c", projectMetrics({ projectKey: "C" })),
    ];

    // when
    const slices = jiraFlowBreakdown(repositories);

    // then
    expect(slices).toEqual([
      { label: "Closing at least as much as they open", count: 1, tone: "good" },
      { label: "Opening more than they close", count: 1, tone: "critical" },
      { label: "No tickets in the window", count: 1, tone: "unknown" },
    ]);
  });

  it("should not read a silent project as a healthy one", () => {
    // given
    // Zero closed is not "at least as much as they opened" in any sense a
    // reader would accept, so a quiet project is its own slice.
    const repositories = [aRepository("a", projectMetrics())];

    // when
    const slices = jiraFlowBreakdown(repositories);

    // then
    expect(slices[0]?.count).toBe(0);
    expect(slices[2]?.count).toBe(1);
  });
});

describe("jiraOpenPriorityRanking", () => {
  it("should merge the projects while keeping the site's own severity order", () => {
    // given
    // The order is Jira's: its priority endpoint returns highest first and the
    // backend preserves that, so the first bar is the site's most severe
    // priority whatever it decided to call it.
    const repositories = [
      aRepository(
        "a",
        projectMetrics({
          projectKey: "A",
          openByPriority: [
            { name: "Highest", count: 2 },
            { name: "Low", count: 4 },
          ],
        }),
      ),
      aRepository(
        "b",
        projectMetrics({
          projectKey: "B",
          openByPriority: [{ name: "Highest", count: 4 }],
        }),
      ),
    ];

    // when
    const ranking = jiraOpenPriorityRanking(repositories);

    // then
    expect(ranking.map((item) => item.label)).toEqual(["Highest", "Low"]);
    expect(ranking[0]).toMatchObject({ value: 6, detail: "60% of the backlog" });
  });

  it("should report nothing when no breakdown was collected", () => {
    // given
    const repositories = [aRepository("a", projectMetrics())];

    // when
    const ranking = jiraOpenPriorityRanking(repositories);

    // then
    expect(ranking).toEqual([]);
  });
});

describe("staleJiraBacklog", () => {
  it("should list the oldest waiting work first, naming the ticket", () => {
    // given
    // A backlog size says how much; this says what has been waiting longest,
    // which is the row somebody can actually pick up.
    const repositories = [
      aRepository(
        "gateway",
        projectMetrics({
          projectKey: "A",
          oldestOpenIssue: {
            key: "A-1",
            summary: "old",
            createdAt: "2026-01-01T00:00:00.000Z",
            ageDays: 30,
          },
        }),
      ),
      aRepository(
        "worker",
        projectMetrics({
          projectKey: "B",
          oldestOpenIssue: {
            key: "B-9",
            summary: "older",
            createdAt: "2025-01-01T00:00:00.000Z",
            ageDays: 400,
          },
        }),
      ),
      aRepository("docs", projectMetrics({ projectKey: "C" })),
    ];

    // when
    const gaps = staleJiraBacklog(repositories);

    // then
    expect(gaps.items.map((item) => item.label)).toEqual(["worker", "gateway"]);
    expect(gaps.items[0]?.reason).toBe("B-9 · 400d");
    expect(gaps.remaining).toBe(0);
  });

  it("should stop at the list size and count the rest", () => {
    // given
    // A list that shows ten of forty and says nothing about the thirty implies
    // it is complete.
    const repositories = Array.from({ length: 12 }, (_unused, index) =>
      aRepository(
        `repo-${index}`,
        projectMetrics({
          projectKey: `P${index}`,
          oldestOpenIssue: {
            key: `P${index}-1`,
            summary: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            ageDays: index,
          },
        }),
      ),
    );

    // when
    const gaps = staleJiraBacklog(repositories);

    // then
    expect(gaps.items).toHaveLength(8);
    expect(gaps.remaining).toBe(4);
    expect(gaps.items[0]?.label).toBe("repo-11");
  });
});
