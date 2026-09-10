import { renderInTestApp } from "@backstage/test-utils";
import type {
  ConfluenceContributorMetrics,
  ConfluenceSpaceMetrics,
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import Grid from "@material-ui/core/Grid";
import { screen } from "@testing-library/react";
import {
  ConfluenceContributorInsights,
  ConfluenceFleetInsights,
  ConfluenceRepositoryInsights,
} from "../../../../src/presentation/components/insights/confluence_insights";
import { rootRouteRef } from "../../../../src/routes";
import { ContributorBuilder } from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

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

const aContributor = (
  key: string,
  metrics: ConfluenceContributorMetrics | null,
): ContributorSummary =>
  ({
    ...ContributorBuilder.create().withDisplayName(key).build(),
    confluenceMetrics: metrics,
  }) as ContributorSummary;

const aRepository = (
  id: string,
  metrics: ConfluenceSpaceMetrics | null,
): RepositorySummary =>
  ({
    ...RepositoryBuilder.create().withId(id).build(),
    confluenceMetrics: metrics,
  }) as RepositorySummary;

/**
 * Each part emits `Grid item` children so it can drop into its page's own grid,
 * so the test supplies the container the page would — and mounts the plugin
 * root, because the ranking of people links to the contributor detail page and
 * a route ref with nothing under it has no path to give.
 */
const render = (ui: React.ReactElement) =>
  renderInTestApp(<Grid container>{ui}</Grid>, {
    mountedRoutes: { "/": rootRouteRef },
  });

describe("ConfluenceFleetInsights", () => {
  it("should headline what the fleet wrote", async () => {
    // given
    const repositories = [
      aRepository("a", space({ pagesCreated: 42, pagesEdited: 118, commentsWritten: 90 })),
    ];
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 12 }))];

    // when
    await render(
      <ConfluenceFleetInsights repositories={repositories} contributors={contributors} />,
    );

    // then
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("118 edited")).toBeInTheDocument();
    expect(screen.getByText("1 space named by the catalog.", { exact: false }))
      .toBeInTheDocument();
  });

  it("should say the site has no analytics rather than reporting no readers", async () => {
    // given
    // Page views are a Confluence Cloud Premium feature. A zero here would
    // claim nobody opened the pages, which is a different and much worse thing
    // to tell a team that just wrote them.
    const contributors = [
      aContributor("Ada", confluence({ pagesCreated: 3, analytics: "unavailable" })),
    ];

    // when
    await render(
      <ConfluenceFleetInsights repositories={[]} contributors={contributors} />,
    );

    // then
    expect(
      screen.getByText("Premium-only API; not available here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Premium feature; on Standard there is nothing to switch on/),
    ).toBeInTheDocument();
  });

  it("should say no page could be measured rather than reporting zero words", async () => {
    // given
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 3 }))];

    // when
    await render(
      <ConfluenceFleetInsights repositories={[]} contributors={contributors} />,
    );

    // then
    expect(screen.getByText("no page could be measured")).toBeInTheDocument();
  });

  it("should report the written volume when the run could measure it", async () => {
    // given
    const contributors = [
      aContributor(
        "Ada",
        confluence({
          wordsAdded: 2400,
          wordsRemoved: 300,
          volumeUnit: "words",
          pagesMeasuredForVolume: 9,
        }),
      ),
    ];

    // when
    await render(
      <ConfluenceFleetInsights repositories={[]} contributors={contributors} />,
    );

    // then
    expect(screen.getByText("2,400")).toBeInTheDocument();
    expect(screen.getByText("300 pruned")).toBeInTheDocument();
  });

  it("should leave the people and the rot to the tabs that list them", async () => {
    // given
    const repositories = [aRepository("a", space({ parentlessPages: 7 }))];
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 2 }))];

    // when
    await render(
      <ConfluenceFleetInsights repositories={repositories} contributors={contributors} />,
    );

    // then
    expect(screen.queryByText("Who is documenting")).not.toBeInTheDocument();
    expect(screen.queryByText("Documentation rot")).not.toBeInTheDocument();
  });
});

describe("ConfluenceContributorInsights", () => {
  it("should rank who is documenting", async () => {
    // given
    const contributors = [
      aContributor("Ada", confluence({ pagesCreated: 2, commentsWritten: 40 })),
      aContributor("Bo", confluence({ pagesCreated: 1 })),
    ];

    // when
    await render(<ConfluenceContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByLabelText(/^Ada: 42 contributions/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Bo: 1 contributions/)).toBeInTheDocument();
  });

  it("should say the ranking covers Confluence's trailing window, not the range picked", async () => {
    // given
    // The card now sits under a range picker that reads "Last 7 days", and
    // Confluence's figures do not move with it. The note used to live on the
    // fleet card above this one; after the split it has to travel with the card.
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 2 }))];

    // when
    await render(<ConfluenceContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByText(/do not move with the range picker/u)).toBeInTheDocument();
  });

  it("should send a row to the plugin's contributor page", async () => {
    // given
    // The person at the top of this ranking is usually nowhere near the top of
    // the commit ranking, which is exactly the row somebody wants to open.
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 2 }))];

    // when
    await render(<ConfluenceContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute(
      "href",
      "/contributors/person?key=Ada",
    );
  });

  it("should explain why no volume ranking is available", async () => {
    // given
    // The chart is empty because fetching page bodies costs requests, not
    // because nobody wrote anything — and the difference is actionable.
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 2 }))];

    // when
    await render(<ConfluenceContributorInsights contributors={contributors} />);

    // then
    expect(
      screen.getByText(/Confluence serves no per-edit change size/),
    ).toBeInTheDocument();
  });

  it("should say nobody wrote anything when nothing has been collected yet", async () => {
    // given
    const contributors = [aContributor("Ada", null)];

    // when
    await render(<ConfluenceContributorInsights contributors={contributors} />);

    // then
    expect(
      screen.getByText("Nobody wrote anything in Confluence in the measured window."),
    ).toBeInTheDocument();
  });
});

describe("ConfluenceRepositoryInsights", () => {
  it("should name the spaces carrying the most rot", async () => {
    // given
    const repositories = [
      aRepository(
        "a",
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
    await render(<ConfluenceRepositoryInsights repositories={repositories} />);

    // then
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("60% stale · oldest 2021-03-04")).toBeInTheDocument();
  });

  it("should say the rot is measured over Confluence's trailing window", async () => {
    // given
    const repositories = [aRepository("a", space({ totalPages: 10, stalePages: 4 }))];

    // when
    await render(<ConfluenceRepositoryInsights repositories={repositories} />);

    // then
    expect(screen.getByText(/do not move with the range picker/u)).toBeInTheDocument();
  });

  it("should list the spaces holding pages nothing links to", async () => {
    // given
    const repositories = [aRepository("a", space({ parentlessPages: 7 }))];

    // when
    await render(<ConfluenceRepositoryInsights repositories={repositories} />);

    // then
    expect(screen.getByText("7 with no parent")).toBeInTheDocument();
    // The name matters: Confluence Cloud exposes no backlink query, so half the
    // classic orphan definition is unmeasurable and the card says so.
    expect(screen.getByText(/counts parentless pages/)).toBeInTheDocument();
  });

  it("should degrade to empty messages when nothing has been collected yet", async () => {
    // given
    const repositories = [aRepository("a", null)];

    // when
    await render(<ConfluenceRepositoryInsights repositories={repositories} />);

    // then
    expect(
      screen.getByText("No space has pages older than the staleness threshold."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every page in every tracked space sits under a parent."),
    ).toBeInTheDocument();
  });
});
