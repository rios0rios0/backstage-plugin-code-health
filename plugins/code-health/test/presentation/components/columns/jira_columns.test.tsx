import { render, screen, within } from "@testing-library/react";
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
import type { ColumnDef } from "@tanstack/react-table";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { MemoryRouter } from "react-router-dom";
import { DataTable } from "../../../../src/presentation/components/data_table";
import {
  jiraContributorColumns,
  jiraRepositoryColumns,
} from "../../../../src/presentation/components/columns/jira_columns";
import { ContributorBuilder } from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

const WINDOW = { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" };

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

/**
 * The smallest table that can render a column group.
 *
 * The columns are exported on their own so a page can splice them into whatever
 * table it owns; this mounts them the way one would, through the same
 * `DataTable` the real tables use, so a cell that renders only under the real
 * table's markup cannot pass here.
 */
const Harness = <T,>({
  data,
  columns,
  sortBy,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  sortBy?: string;
}) => {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(sortBy === undefined
      ? {}
      : { state: { sorting: [{ id: sortBy, desc: true }] } }),
  });
  return <DataTable table={table} isLoading={false} />;
};

const renderContributors = (contributors: ContributorSummary[], sortBy?: string) =>
  render(
    <MemoryRouter>
      <Harness
        data={contributors}
        columns={jiraContributorColumns()}
        {...(sortBy === undefined ? {} : { sortBy })}
      />
    </MemoryRouter>,
  );

const renderRepositories = (repositories: RepositorySummary[], sortBy?: string) =>
  render(
    <MemoryRouter>
      <Harness
        data={repositories}
        columns={jiraRepositoryColumns()}
        {...(sortBy === undefined ? {} : { sortBy })}
      />
    </MemoryRouter>,
  );

/** The display names in the order the table put them in. */
const orderOf = (): string[] =>
  screen
    .getAllByRole("row")
    .slice(2)
    .map((row) => row.textContent ?? "");

/** The single body row, which sits under the headings and the filter row. */
const dataRow = (): HTMLElement => {
  const rows = screen.getAllByRole("row");
  const last = rows.at(-1);
  if (last === undefined) throw new Error("the table rendered no rows");
  return last;
};

const aContributor = (metrics: JiraContributorMetrics | null): ContributorSummary => ({
  ...ContributorBuilder.create().withDisplayName("Dev Eloper").build(),
  jiraMetrics: metrics,
});

const aRepository = (metrics: JiraRepositoryMetrics | null): RepositorySummary => ({
  ...RepositoryBuilder.create().build(),
  jiraMetrics: metrics,
});

describe("jiraContributorColumns", () => {
  it("should show tickets closed with what they raised underneath", () => {
    // given
    const contributors = [
      aContributor(personMetrics({ issuesResolved: 12, issuesCreated: 4 })),
    ];

    // when
    renderContributors(contributors);

    // then
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("4 raised")).toBeInTheDocument();
  });

  it("should break interactions down into the three things they are made of", () => {
    // given
    // A hundred transitions and no comments is somebody dragging cards; a
    // hundred comments and no transitions is somebody carrying a conversation.
    const contributors = [
      aContributor(
        personMetrics({
          interactions: {
            comments: 7,
            worklogEntries: 3,
            transitions: 11,
            truncatedIssues: 0,
          },
        }),
      ),
    ];

    // when
    renderContributors(contributors);

    // then
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("7 comments · 3 logged · 11 moves")).toBeInTheDocument();
  });

  it("should mark a truncated interaction count so a floor never passes as a total", () => {
    // given
    const contributors = [
      aContributor(
        personMetrics({
          interactions: {
            comments: 20,
            worklogEntries: 0,
            transitions: 5,
            truncatedIssues: 2,
          },
        }),
      ),
    ];

    // when
    renderContributors(contributors);

    // then
    expect(screen.getByText("25+")).toBeInTheDocument();
  });

  it("should leave a component out of the breakdown when the site never reported it", () => {
    // given
    // A site whose search returns no comment bodies has not said there were no
    // comments, so a "0 comments" caption would be an invention.
    const contributors = [
      aContributor(
        personMetrics({
          interactions: {
            comments: null,
            worklogEntries: null,
            transitions: 6,
            truncatedIssues: 0,
          },
        }),
      ),
    ];

    // when
    renderContributors(contributors);

    // then
    expect(screen.getByText("6 moves")).toBeInTheDocument();
    expect(screen.queryByText(/comments/u)).not.toBeInTheDocument();
  });

  it("should render an em dash rather than a zero for story points nobody could measure", () => {
    // given
    // Story points live on a custom field whose id differs per site. A zero
    // would read as a team estimating nothing, which is an accusation.
    const contributors = [aContributor(personMetrics({ storyPointsCompleted: null }))];

    // when
    renderContributors(contributors);

    // then
    expect(within(dataRow()).getAllByText("-").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 assigned")).not.toBeInTheDocument();
  });

  it("should show story points completed against what was assigned", () => {
    // given
    const contributors = [
      aContributor(personMetrics({ storyPointsCompleted: 13, storyPointsEstimated: 21 })),
    ];

    // when
    renderContributors(contributors);

    // then
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("21 assigned")).toBeInTheDocument();
  });

  it("should show an average cycle time over the tickets it was measured on", () => {
    // given
    // An average rather than a median because several Atlassian accounts merge
    // onto this row, and medians cannot be added.
    const contributors = [
      aContributor(personMetrics({ cycleTime: { totalHours: 60, issues: 4 } })),
    ];

    // when
    renderContributors(contributors);

    // then
    expect(screen.getByText("15h")).toBeInTheDocument();
    expect(screen.getByText("over 4")).toBeInTheDocument();
  });

  it("should colour a reopened count only when there is something to answer for", () => {
    // given
    const rework = [aContributor(personMetrics({ reopened: 3 }))];
    const clean = [aContributor(personMetrics({ reopened: 0 }))];

    // when
    const withRework = renderContributors(rework);
    const reworked = withRework.container.querySelector("[data-tone]");
    withRework.unmount();
    const withoutRework = renderContributors(clean);

    // then
    expect(reworked).toHaveAttribute("data-tone", "rework");
    expect(reworked).toHaveTextContent("3");
    const quiet = withoutRework.container.querySelector("[data-tone]");
    expect(quiet).toHaveAttribute("data-tone", "clean");
    expect(quiet).toHaveTextContent("0");
  });

  it("should sort on the figure each column shows, not on the row underneath it", () => {
    // given
    // The columns carry accessors so a reader can rank the table by any of
    // them; a column that renders one number and sorts on another is worse than
    // one that does not sort at all.
    const contributors = [
      {
        ...aContributor(
          personMetrics({
            issuesResolved: 1,
            reopened: 9,
            storyPointsCompleted: 1,
            cycleTime: { totalHours: 100, issues: 1 },
            interactions: { comments: 1, worklogEntries: 0, transitions: 0, truncatedIssues: 0 },
          }),
        ),
        key: "slow",
        displayName: "slow",
      },
      {
        ...aContributor(
          personMetrics({
            issuesResolved: 50,
            reopened: 0,
            storyPointsCompleted: 40,
            cycleTime: { totalHours: 2, issues: 1 },
            interactions: { comments: 90, worklogEntries: 0, transitions: 0, truncatedIssues: 0 },
          }),
        ),
        key: "fast",
        displayName: "fast",
      },
    ];

    // when
    const byClosed = renderContributors(contributors, "jiraResolved");
    const closedFirst = orderOf()[0];
    byClosed.unmount();

    const byCycle = renderContributors(contributors, "jiraCycleTime");
    const slowestFirst = orderOf()[0];
    byCycle.unmount();

    const byReopened = renderContributors(contributors, "jiraReopened");
    const reworkFirst = orderOf()[0];
    byReopened.unmount();

    const byPoints = renderContributors(contributors, "jiraStoryPoints");
    const mostPointsFirst = orderOf()[0];
    byPoints.unmount();

    renderContributors(contributors, "jiraInteractions");
    const busiestFirst = orderOf()[0];

    // then
    expect(closedFirst).toContain("50");
    expect(slowestFirst).toContain("4d 4h");
    expect(reworkFirst).toContain("9");
    expect(mostPointsFirst).toContain("40");
    expect(busiestFirst).toContain("90");
  });

  it("should render every cell as an em dash for a person Jira never saw", () => {
    // given
    // A committer with no Atlassian account must not appear as somebody who
    // closed no tickets.
    const contributors = [aContributor(null)];

    // when
    renderContributors(contributors);

    // then
    expect(within(dataRow()).getAllByText("-")).toHaveLength(5);
  });
});

describe("jiraRepositoryColumns", () => {
  it("should show what a project closed against what it took on", () => {
    // given
    const repositories = [
      aRepository(projectMetrics({ issuesResolved: 30, issuesCreated: 25 })),
    ];

    // when
    renderRepositories(repositories);

    // then
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("25 opened")).toBeInTheDocument();
  });

  it("should show a median cycle time with the slow tail underneath", () => {
    // given
    // A repository row is never merged with another, so a median is safe here —
    // the contributors table shows an average for the opposite reason.
    const repositories = [
      aRepository(
        projectMetrics({
          cycleTime: { totalHours: 200, issues: 10, medianHours: 18, p85Hours: 50 },
        }),
      ),
    ];

    // when
    renderRepositories(repositories);

    // then
    expect(screen.getByText("18h")).toBeInTheDocument();
    expect(screen.getByText("85th: 2d 2h")).toBeInTheDocument();
  });

  it("should put the denominator next to the bug ratio", () => {
    // given
    // "18% bugs" is a very different conversation at 2 of 11 than at 180 of
    // 1000, and a percentage with no denominator invites the wrong one.
    const repositories = [
      aRepository(
        projectMetrics({
          issuesResolved: 8,
          bugRatio: 25,
          resolvedByType: { ...EMPTY_JIRA_ISSUE_TYPES, bug: 2, task: 6 },
        }),
      ),
    ];

    // when
    renderRepositories(repositories);

    // then
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("2 of 8")).toBeInTheDocument();
  });

  it("should show the backlog with the age of its oldest ticket", () => {
    // given
    const repositories = [
      aRepository(
        projectMetrics({
          openIssues: 42,
          throughputPerWeek: 5.5,
          oldestOpenIssue: {
            key: "PLAT-1",
            summary: "waiting",
            createdAt: "2026-01-01T00:00:00.000Z",
            ageDays: 219,
          },
        }),
      ),
    ];

    // when
    renderRepositories(repositories);

    // then
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("oldest 219d")).toBeInTheDocument();
    expect(screen.getByText("5.5")).toBeInTheDocument();
    expect(screen.getByText("per week")).toBeInTheDocument();
  });

  it("should sort each repository column on the figure it renders", () => {
    // given
    const repositories = [
      {
        ...aRepository(
          projectMetrics({
            issuesResolved: 2,
            bugRatio: 90,
            openIssues: 3,
            cycleTime: { totalHours: 8, issues: 1, medianHours: 8, p85Hours: 8 },
          }),
        ),
        name: "small",
      },
      {
        ...aRepository(
          projectMetrics({
            issuesResolved: 60,
            bugRatio: 5,
            openIssues: 400,
            cycleTime: { totalHours: 1, issues: 1, medianHours: 1, p85Hours: 1 },
          }),
        ),
        name: "big",
      },
    ];

    // when
    const byTickets = renderRepositories(repositories, "jiraTickets");
    const busiestFirst = orderOf()[0];
    byTickets.unmount();

    const byBugs = renderRepositories(repositories, "jiraBugRatio");
    const buggiestFirst = orderOf()[0];
    byBugs.unmount();

    const byOpen = renderRepositories(repositories, "jiraOpen");
    const largestBacklogFirst = orderOf()[0];
    byOpen.unmount();

    const byCycle = renderRepositories(repositories, "jiraRepoCycleTime");
    const slowestFirst = orderOf()[0];
    byCycle.unmount();

    renderRepositories(repositories, "jiraThroughput");

    // then
    expect(busiestFirst).toContain("60");
    expect(buggiestFirst).toContain("90%");
    expect(largestBacklogFirst).toContain("400");
    expect(slowestFirst).toContain("8h");
  });

  it("should render every cell as an em dash for a repository with no Jira project", () => {
    // given
    // Several repositories legitimately track no work in Jira, and a row of
    // zeroes would put an accusation on the dashboard.
    const repositories = [aRepository(null)];

    // when
    renderRepositories(repositories);

    // then
    expect(within(dataRow()).getAllByText("-")).toHaveLength(5);
  });
});
