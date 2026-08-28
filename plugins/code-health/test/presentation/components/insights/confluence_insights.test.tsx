import type {
  ConfluenceContributorMetrics,
  ConfluenceSpaceMetrics,
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { render as renderBare, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfluenceInsights } from "../../../../src/presentation/components/insights/confluence_insights";
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

// The ranking chart links a contributor to their catalog user, so the cards
// mount inside a router — which is how the Insights page renders them.
const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

describe("ConfluenceInsights", () => {
  it("should headline what the fleet wrote", () => {
    // given
    const repositories = [
      aRepository("a", space({ pagesCreated: 42, pagesEdited: 118, commentsWritten: 90 })),
    ];
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 12 }))];

    // when
    render(
      <ConfluenceInsights repositories={repositories} contributors={contributors} />,
    );

    // then
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("118 edited")).toBeInTheDocument();
    expect(screen.getByText("1 space named by the catalog.", { exact: false }))
      .toBeInTheDocument();
  });

  it("should say the site has no analytics rather than reporting no readers", () => {
    // given
    // Page views are a Confluence Cloud Premium feature. A zero here would
    // claim nobody opened the pages, which is a different and much worse thing
    // to tell a team that just wrote them.
    const contributors = [
      aContributor("Ada", confluence({ pagesCreated: 3, analytics: "unavailable" })),
    ];

    // when
    render(<ConfluenceInsights repositories={[]} contributors={contributors} />);

    // then
    expect(
      screen.getByText("Premium-only API; not available here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Premium feature; on Standard there is nothing to switch on/),
    ).toBeInTheDocument();
  });

  it("should say no page could be measured rather than reporting zero words", () => {
    // given
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 3 }))];

    // when
    render(<ConfluenceInsights repositories={[]} contributors={contributors} />);

    // then
    expect(screen.getByText("no page could be measured")).toBeInTheDocument();
  });

  it("should report the written volume when the run could measure it", () => {
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
    render(<ConfluenceInsights repositories={[]} contributors={contributors} />);

    // then
    // The figure appears on the tile and again on the volume ranking beneath.
    expect(screen.getAllByText("2,400").length).toBeGreaterThan(0);
    expect(screen.getByText("300 pruned")).toBeInTheDocument();
  });

  it("should rank who is documenting", () => {
    // given
    const contributors = [
      aContributor("Ada", confluence({ pagesCreated: 2, commentsWritten: 40 })),
      aContributor("Bo", confluence({ pagesCreated: 1 })),
    ];

    // when
    render(<ConfluenceInsights repositories={[]} contributors={contributors} />);

    // then
    const ranking = screen.getByLabelText(/^Ada: 42 contributions/);
    expect(ranking).toBeInTheDocument();
  });

  it("should explain why no volume ranking is available", () => {
    // given
    // The chart is empty because fetching page bodies costs requests, not
    // because nobody wrote anything — and the difference is actionable.
    const contributors = [aContributor("Ada", confluence({ pagesCreated: 2 }))];

    // when
    render(<ConfluenceInsights repositories={[]} contributors={contributors} />);

    // then
    expect(
      screen.getByText(/Confluence serves no per-edit change size/),
    ).toBeInTheDocument();
  });

  it("should name the spaces carrying the most rot", () => {
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
    render(<ConfluenceInsights repositories={repositories} contributors={[]} />);

    // then
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("60% stale · oldest 2021-03-04")).toBeInTheDocument();
  });

  it("should list the spaces holding pages nothing links to", () => {
    // given
    const repositories = [
      aRepository("a", space({ parentlessPages: 7 })),
    ];

    // when
    render(<ConfluenceInsights repositories={repositories} contributors={[]} />);

    // then
    expect(screen.getByText("7 with no parent")).toBeInTheDocument();
    // The name matters: Confluence Cloud exposes no backlink query, so half the
    // classic orphan definition is unmeasurable and the card says so.
    expect(screen.getByText(/counts parentless pages/)).toBeInTheDocument();
  });

  it("should degrade to empty messages when nothing has been collected yet", () => {
    // given
    const repositories = [aRepository("a", null)];
    const contributors = [aContributor("Ada", null)];

    // when
    render(
      <ConfluenceInsights repositories={repositories} contributors={contributors} />,
    );

    // then
    expect(
      screen.getByText("Nobody wrote anything in Confluence in the measured window."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No space has pages older than the staleness threshold."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every page in every tracked space sits under a parent."),
    ).toBeInTheDocument();
  });
});
