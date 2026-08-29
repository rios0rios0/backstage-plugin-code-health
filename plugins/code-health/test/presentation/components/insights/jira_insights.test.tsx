import { render, screen } from "@testing-library/react";
import type {
  ContributorSummary,
  JiraContributorMetrics,
  JiraRepositoryMetrics,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  EMPTY_JIRA_INTERACTIONS,
  EMPTY_JIRA_ISSUE_TYPES,
} from "@rios0rios0/backstage-plugin-code-health-common";
import Grid from "@material-ui/core/Grid";
import { MemoryRouter } from "react-router-dom";
import { JiraInsights } from "../../../../src/presentation/components/insights/jira_insights";
import { ContributorBuilder } from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

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

const aRepository = (
  name: string,
  metrics: JiraRepositoryMetrics | null,
): RepositorySummary => ({
  ...RepositoryBuilder.create().withId(name).build(),
  name,
  jiraMetrics: metrics,
});

const aContributor = (
  name: string,
  metrics: JiraContributorMetrics | null,
): ContributorSummary => ({
  ...ContributorBuilder.create().withDisplayName(name).build(),
  jiraMetrics: metrics,
});

/**
 * The card emits loose `Grid item` children so it can drop into the Insights
 * page's own grid, so the test supplies the container the page would.
 */
const renderCard = (
  repositories: readonly RepositorySummary[],
  contributors: readonly ContributorSummary[],
) =>
  render(
    <MemoryRouter>
      <Grid container>
        <JiraInsights repositories={repositories} contributors={contributors} />
      </Grid>
    </MemoryRouter>,
  );

describe("JiraInsights", () => {
  it("should explain itself rather than draw a page of blanks when nothing was measured", () => {
    // given
    // Jira is on — the card would not be mounted otherwise — but no entity
    // carries an annotation, or the first snapshot has not run. Six cards of em
    // dashes look broken; a sentence naming the two possibilities is actionable.
    const repositories = [aRepository("gateway", null)];
    const contributors = [aContributor("dev", null)];

    // when
    renderCard(repositories, contributors);

    // then
    expect(screen.getByText(/jira\/project-key/u)).toBeInTheDocument();
    expect(screen.queryByText("Jira delivery")).not.toBeInTheDocument();
    expect(screen.queryByText("Backlog flow")).not.toBeInTheDocument();
  });

  it("should headline what the fleet closed, and against how many projects", () => {
    // given
    const shared = projectMetrics({
      issuesCreated: 20,
      issuesResolved: 31,
      throughputPerWeek: 7.5,
      openIssues: 44,
      reopened: 2,
      bugRatio: 20,
      resolvedByType: { ...EMPTY_JIRA_ISSUE_TYPES, bug: 6, story: 25 },
      cycleTime: { totalHours: 62, issues: 31, medianHours: 2, p85Hours: 4 },
      leadTime: { totalHours: 310, issues: 31, medianHours: 9, p85Hours: 20 },
    });
    // Two repositories, one project: the figures must not double.
    const repositories = [aRepository("gateway", shared), aRepository("worker", shared)];

    // when
    renderCard(repositories, []);

    // then
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("20 raised")).toBeInTheDocument();
    expect(screen.getByText("Across 1 project named by 2 repositories.")).toBeInTheDocument();
    expect(screen.getByText("7.5")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByText("10h")).toBeInTheDocument();
    expect(screen.getByText("6 of 31 closed")).toBeInTheDocument();
  });

  it("should render an em dash for every figure Jira could not answer", () => {
    // given
    // Story points and the backlog count are both routinely unavailable, and a
    // zero there reads as a team that estimates nothing and has no work.
    const repositories = [aRepository("gateway", projectMetrics())];

    // when
    renderCard(repositories, []);

    // then
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("should rank closing separately from board activity", () => {
    // given
    // The two rankings only partly overlap on most teams, and the gap between
    // them is usually the person doing the work nobody writes code for.
    const contributors = [
      aContributor("Closer", personMetrics({ issuesResolved: 9 })),
      aContributor(
        "Triager",
        personMetrics({
          interactions: { comments: 40, worklogEntries: 0, transitions: 20, truncatedIssues: 0 },
        }),
      ),
    ];

    // when
    renderCard([aRepository("gateway", projectMetrics())], contributors);

    // then
    expect(screen.getByText("Who closes tickets")).toBeInTheDocument();
    expect(screen.getByText("Who keeps the board moving")).toBeInTheDocument();
    expect(screen.getByText("Closer")).toBeInTheDocument();
    expect(screen.getByText("Triager")).toBeInTheDocument();
  });

  it("should say the backlog by priority was not collected rather than draw an empty chart", () => {
    // given
    // The priority breakdown is the first thing a run gives up when its request
    // allowance runs low, and an empty chart would read as an empty backlog.
    const repositories = [aRepository("gateway", projectMetrics({ openIssues: 40 }))];

    // when
    renderCard(repositories, []);

    // then
    expect(screen.getByText(/request allowance is running low/u)).toBeInTheDocument();
  });

  it("should chart the backlog by priority in the site's own severity order", () => {
    // given
    const repositories = [
      aRepository(
        "gateway",
        projectMetrics({
          openIssues: 6,
          openByPriority: [
            { name: "Blocker", count: 1 },
            { name: "Trivial", count: 5 },
          ],
        }),
      ),
    ];

    // when
    renderCard(repositories, []);

    // then
    const rows = screen.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"));
    const priorityRows = rows.filter((label) => label?.includes("open tickets"));
    expect(priorityRows[0]).toContain("Blocker");
    expect(priorityRows[1]).toContain("Trivial");
  });

  it("should name the ticket that has been waiting longest", () => {
    // given
    const repositories = [
      aRepository(
        "gateway",
        projectMetrics({
          oldestOpenIssue: {
            key: "PLAT-3",
            summary: "still waiting",
            createdAt: "2025-09-01T00:00:00.000Z",
            ageDays: 361,
          },
        }),
      ),
    ];

    // when
    renderCard(repositories, []);

    // then
    expect(screen.getByText("PLAT-3 · 361d")).toBeInTheDocument();
  });

  it("should describe several projects in the plural", () => {
    // given
    const repositories = [
      aRepository("gateway", projectMetrics({ projectKey: "A" })),
      aRepository("worker", projectMetrics({ projectKey: "B" })),
    ];

    // when
    renderCard(repositories, []);

    // then
    expect(
      screen.getByText("Across 2 projects named by 2 repositories."),
    ).toBeInTheDocument();
  });

  it("should describe a single repository in the singular", () => {
    // given
    const repositories = [aRepository("gateway", projectMetrics())];

    // when
    renderCard(repositories, []);

    // then
    expect(screen.getByText("Across 1 project named by 1 repository.")).toBeInTheDocument();
  });
});
