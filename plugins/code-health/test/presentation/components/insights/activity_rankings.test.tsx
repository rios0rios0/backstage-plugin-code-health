import { renderInTestApp } from "@backstage/test-utils";
import Grid from "@material-ui/core/Grid";
import type {
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { screen } from "@testing-library/react";
import { ActivityRankings } from "../../../../src/presentation/components/insights/activity_rankings";
import { rootRouteRef } from "../../../../src/routes";
import { ContributorBuilder } from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

/**
 * The card emits loose `Grid item` children so it can drop into the page's own
 * grid, so the test supplies the container the page would — and mounts the
 * plugin root, because the rankings resolve their links through `useRouteRef`
 * and a route ref with nothing mounted under it has no path to give.
 */
const renderCards = (
  repositories: readonly RepositorySummary[],
  contributors: readonly ContributorSummary[],
  repositoriesError: string | null = null,
) =>
  renderInTestApp(
    <Grid container>
      <ActivityRankings
        repositories={repositories}
        contributors={contributors}
        repositoriesError={repositoriesError}
      />
    </Grid>,
    { mountedRoutes: { "/": rootRouteRef } },
  );

describe("ActivityRankings", () => {
  it("should rank contributors by commits", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("alice").withCommits(30).build(),
      ContributorBuilder.create().withDisplayName("bob").withCommits(2).build(),
    ];

    // when
    await renderCards([], contributors);

    // then
    expect(screen.getByText("Top contributors")).toBeInTheDocument();
    const ranked = screen
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("aria-label"));
    expect(ranked[0]).toContain("alice: 30 commits");
  });

  it("should rank reviewers separately from committers", async () => {
    // given
    // Review load concentrating on one person is a bus factor, and it is
    // invisible on a commit ranking — which is why both cards are here.
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withCommits(30)
        .withReviewsGiven(1)
        .build(),
      ContributorBuilder.create()
        .withDisplayName("bob")
        .withCommits(2)
        .withReviewsGiven(40)
        .build(),
    ];

    // when
    await renderCards([], contributors);

    // then
    expect(screen.getByText("Review load")).toBeInTheDocument();
    expect(screen.getByLabelText(/^bob: 40 reviews/u)).toBeInTheDocument();
  });

  it("should rank repositories by commits", async () => {
    // given
    const repositories = [
      RepositoryBuilder.create().withName("gateway").withActivity({ commits: 9 }).build(),
      RepositoryBuilder.create().withName("idle").withActivity({ commits: 0 }).build(),
    ];

    // when
    await renderCards(repositories, []);

    // then
    expect(screen.getByText("Most active repositories")).toBeInTheDocument();
    expect(screen.getByLabelText(/^gateway: 9 commits/u)).toBeInTheDocument();
    // A zero-valued row would read as a repository that exists and did nothing,
    // which is not what the ranking is claiming.
    expect(screen.queryByLabelText(/^idle:/u)).not.toBeInTheDocument();
  });

  it("should send a person's row to the plugin's contributor page, not to the catalog", async () => {
    // given
    // A person key carries a colon and a slash, so it travels in the query
    // string; the catalog entity answers who somebody is, and the ranking's
    // reader is already asking what they did.
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withKey("user:default/alice")
        .withEntityRef("user:default/alice")
        .withCommits(30)
        .withReviewsGiven(0)
        .build(),
    ];

    // when
    await renderCards([], contributors);

    // then
    expect(screen.getByRole("link", { name: "alice" })).toHaveAttribute(
      "href",
      "/contributors/person?key=user%3Adefault%2Falice",
    );
  });

  it("should send a repository's row to the plugin's repository page", async () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withId("gateway-id")
        .withName("gateway")
        .withActivity({ commits: 9 })
        .build(),
    ];

    // when
    await renderCards(repositories, []);

    // then
    expect(screen.getByRole("link", { name: "gateway" })).toHaveAttribute(
      "href",
      "/repositories/gateway-id",
    );
  });

  it("should say why the repository ranking is empty when its fetch failed", async () => {
    // given
    // "No commits were recorded" over a failed request reports a quiet window
    // nobody measured, and the contributors beside it loaded perfectly well.
    const contributors = [
      ContributorBuilder.create().withDisplayName("alice").withCommits(30).build(),
    ];

    // when
    await renderCards([], contributors, "Server error");

    // then
    expect(
      screen.getByText("Repositories could not be loaded: Server error"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^alice: 30 commits/u)).toBeInTheDocument();
  });

  it("should say so when nobody committed or reviewed", async () => {
    // given / when
    await renderCards([], []);

    // then
    expect(screen.getByText("No reviews were recorded in this window.")).toBeInTheDocument();
    expect(
      screen.getAllByText("No commits were recorded in this window."),
    ).toHaveLength(2);
  });

  it("should read an omitted error as nothing having failed", async () => {
    // given
    // A caller whose repositories arrive on the same request as its people has
    // no separate failure to report, so the prop is optional.
    await renderInTestApp(
      <Grid container>
        <ActivityRankings repositories={[]} contributors={[]} />
      </Grid>,
      { mountedRoutes: { "/": rootRouteRef } },
    );

    // then
    expect(
      screen.getAllByText("No commits were recorded in this window."),
    ).toHaveLength(2);
    expect(screen.queryByText(/could not be loaded/u)).not.toBeInTheDocument();
  });
});
