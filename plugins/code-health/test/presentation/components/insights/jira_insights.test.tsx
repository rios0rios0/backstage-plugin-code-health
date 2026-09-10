import { renderInTestApp } from "@backstage/test-utils";
import { screen } from "@testing-library/react";
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
import {
  JiraContributorInsights,
  JiraFleetInsights,
  JiraRepositoryInsights,
} from "../../../../src/presentation/components/insights/jira_insights";
import { rootRouteRef } from "../../../../src/routes";
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
 * Each part emits loose `Grid item` children so it can drop into its page's own
 * grid, so the test supplies the container the page would — and mounts the
 * plugin root, because the rankings of people resolve their links through
 * `useRouteRef` and a route ref with nothing under it has no path to give.
 */
const renderCard = (ui: React.ReactElement) =>
  renderInTestApp(<Grid container>{ui}</Grid>, {
    mountedRoutes: { "/": rootRouteRef },
  });

describe("JiraFleetInsights", () => {
  it("should explain itself rather than draw a page of blanks when nothing was measured", async () => {
    // given
    // Jira is on — the card would not be mounted otherwise — but no entity
    // carries an annotation, or the first snapshot has not run. Six cards of em
    // dashes look broken; a sentence naming the two possibilities is actionable.
    const repositories = [aRepository("gateway", null)];
    const contributors = [aContributor("dev", null)];

    // when
    await renderCard(
      <JiraFleetInsights repositories={repositories} contributors={contributors} />,
    );

    // then
    expect(screen.getByText(/jira\/project-key/u)).toBeInTheDocument();
    expect(screen.queryByText("Jira delivery")).not.toBeInTheDocument();
  });

  it("should headline what the fleet closed, and against how many projects", async () => {
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
    await renderCard(<JiraFleetInsights repositories={repositories} contributors={[]} />);

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

  it("should render an em dash for every figure Jira could not answer", async () => {
    // given
    // Story points and the backlog count are both routinely unavailable, and a
    // zero there reads as a team that estimates nothing and has no work.
    const repositories = [aRepository("gateway", projectMetrics())];

    // when
    await renderCard(<JiraFleetInsights repositories={repositories} contributors={[]} />);

    // then
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("should leave the people and the backlog to the tabs that list them", async () => {
    // given
    const repositories = [
      aRepository("gateway", projectMetrics({ openIssues: 6, issuesResolved: 3 })),
    ];
    const contributors = [aContributor("Closer", personMetrics({ issuesResolved: 9 }))];

    // when
    await renderCard(
      <JiraFleetInsights repositories={repositories} contributors={contributors} />,
    );

    // then
    expect(screen.queryByText("Who closes tickets")).not.toBeInTheDocument();
    expect(screen.queryByText("Backlog flow")).not.toBeInTheDocument();
    expect(screen.queryByText("Oldest open work")).not.toBeInTheDocument();
  });

  it("should describe several projects in the plural", async () => {
    // given
    const repositories = [
      aRepository("gateway", projectMetrics({ projectKey: "A" })),
      aRepository("worker", projectMetrics({ projectKey: "B" })),
    ];

    // when
    await renderCard(<JiraFleetInsights repositories={repositories} contributors={[]} />);

    // then
    expect(
      screen.getByText("Across 2 projects named by 2 repositories."),
    ).toBeInTheDocument();
  });

  it("should describe a single repository in the singular", async () => {
    // given
    const repositories = [aRepository("gateway", projectMetrics())];

    // when
    await renderCard(<JiraFleetInsights repositories={repositories} contributors={[]} />);

    // then
    expect(screen.getByText("Across 1 project named by 1 repository.")).toBeInTheDocument();
  });
});

describe("JiraContributorInsights", () => {
  it("should rank closing separately from board activity", async () => {
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
    await renderCard(<JiraContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByText("Who closes tickets")).toBeInTheDocument();
    expect(screen.getByText("Who keeps the board moving")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Closer: 9 tickets/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Triager: 60 interactions/u)).toBeInTheDocument();
  });

  it("should send a row to the plugin's contributor page", async () => {
    // given
    // Somebody who closed tickets and did nothing else is on the closing
    // ranking alone, which is the point of having two of them.
    const contributors = [aContributor("Closer", personMetrics({ issuesResolved: 9 }))];

    // when
    await renderCard(<JiraContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByRole("link", { name: "Closer" })).toHaveAttribute(
      "href",
      "/contributors/person?key=Closer",
    );
  });

  it("should say nobody carries a measurement rather than rank an empty board", async () => {
    // given
    // Jira is on and nobody has been measured, which is a different thing from
    // a quiet week — and the reader should not have to open Insights to learn
    // which of the two they are looking at.
    const contributors = [aContributor("dev", null)];

    // when
    await renderCard(<JiraContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByText(/nobody carries a measurement yet/u)).toBeInTheDocument();
    expect(screen.queryByText("Who closes tickets")).not.toBeInTheDocument();
  });

  it("should say nothing was closed when Jira measured a quiet window", async () => {
    // given
    const contributors = [aContributor("dev", personMetrics())];

    // when
    await renderCard(<JiraContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByText("No tickets were closed in this window.")).toBeInTheDocument();
    expect(
      screen.getByText("No Jira activity was recorded in this window."),
    ).toBeInTheDocument();
  });
});

describe("JiraRepositoryInsights", () => {
  it("should say the backlog by priority was not collected rather than draw an empty chart", async () => {
    // given
    // The priority breakdown is the first thing a run gives up when its request
    // allowance runs low, and an empty chart would read as an empty backlog.
    const repositories = [aRepository("gateway", projectMetrics({ openIssues: 40 }))];

    // when
    await renderCard(<JiraRepositoryInsights repositories={repositories} />);

    // then
    expect(screen.getByText(/request allowance is running low/u)).toBeInTheDocument();
  });

  it("should chart the backlog by priority in the site's own severity order", async () => {
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
    await renderCard(<JiraRepositoryInsights repositories={repositories} />);

    // then
    const rows = screen.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"));
    const priorityRows = rows.filter((label) => label?.includes("open tickets"));
    expect(priorityRows[0]).toContain("Blocker");
    expect(priorityRows[1]).toContain("Trivial");
  });

  it("should name the ticket that has been waiting longest", async () => {
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
    await renderCard(<JiraRepositoryInsights repositories={repositories} />);

    // then
    expect(screen.getByText("Backlog flow")).toBeInTheDocument();
    expect(screen.getByText("PLAT-3 · 361d")).toBeInTheDocument();
  });

  it("should say no repository names a project rather than draw an empty backlog", async () => {
    // given
    // The Repositories tab never fetches contributors, so "somebody commented
    // on a ticket" is not an answer available here — and it would not fill a
    // backlog chart if it were.
    const repositories = [aRepository("gateway", null)];

    // when
    await renderCard(<JiraRepositoryInsights repositories={repositories} />);

    // then
    expect(screen.getByText(/no repository names a project yet/u)).toBeInTheDocument();
    expect(screen.queryByText("Backlog flow")).not.toBeInTheDocument();
  });
});
