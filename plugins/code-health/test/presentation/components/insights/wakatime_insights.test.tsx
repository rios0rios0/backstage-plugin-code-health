import { renderInTestApp } from "@backstage/test-utils";
import Grid from "@material-ui/core/Grid";
import { screen } from "@testing-library/react";
import {
  WakaTimeContributorInsights,
  WakaTimeFleetInsights,
  WakaTimeRepositoryInsights,
} from "../../../../src/presentation/components/insights/wakatime_insights";
import { rootRouteRef } from "../../../../src/routes";
import {
  ContributorBuilder,
  WakaTimeBuilder,
} from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

/**
 * The cards are `<Grid item>` children, so they mount inside a container — and
 * the plugin root is mounted with them, because the two rankings resolve their
 * links through `useRouteRef` and a route ref with nothing under it has no path
 * to give.
 */
const render = (ui: React.ReactElement) =>
  renderInTestApp(<Grid container>{ui}</Grid>, {
    mountedRoutes: { "/": rootRouteRef },
  });

const measured = (name: string, seconds: number) =>
  ContributorBuilder.create()
    .withDisplayName(name)
    .withWakaTimeMetrics(WakaTimeBuilder.create().withTotalSeconds(seconds).build())
    .build();

describe("WakaTimeFleetInsights", () => {
  it("should headline the fleet's coding time and its shape", async () => {
    // given
    const contributors = [measured("alice", 36_000), measured("bob", 7200)];

    // when
    await render(<WakaTimeFleetInsights contributors={contributors} />);

    // then
    expect(screen.getByText("12h")).toBeInTheDocument();
    expect(screen.getByText("2 measured")).toBeInTheDocument();
    // Twice each: once as the headline tile, once as a bar in the breakdown.
    expect(screen.getAllByText("TypeScript")).toHaveLength(2);
    expect(screen.getAllByText("VS Code")).toHaveLength(2);
  });

  it("should report the AI figures as unmeasured rather than as zero", async () => {
    // given
    // Empty means the AI collection was never switched on, not that nobody
    // used AI, and the two want different reactions.
    const contributors = [measured("alice", 3600)];

    // when
    await render(<WakaTimeFleetInsights contributors={contributors} />);

    // then
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("should show the AI share and tokens once they are collected", async () => {
    // given
    const contributor = ContributorBuilder.create()
      .withDisplayName("alice")
      .withWakaTimeMetrics(
        WakaTimeBuilder.create()
          .withAi({ linesAddedByAi: 25, linesAddedByHuman: 75, inputTokens: 900_000 })
          .build(),
      )
      .build();

    // when
    await render(<WakaTimeFleetInsights contributors={[contributor]} />);

    // then
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("900.0k")).toBeInTheDocument();
  });

  it("should name the busiest day", async () => {
    // given
    const contributors = [measured("alice", 12_600)];

    // when
    await render(<WakaTimeFleetInsights contributors={contributors} />);

    // then
    expect(screen.getByText(/Busiest day: 2026-08-05/u)).toBeInTheDocument();
  });

  it("should cut the same hours by category, language and editor", async () => {
    // given
    // Three cuts of one total on one card: an hour under "code reviewing" is
    // also an hour in some language, in some editor, and reading them apart
    // invites somebody to add them up.
    const contributors = [measured("alice", 36_000)];

    // when
    await render(<WakaTimeFleetInsights contributors={contributors} />);

    // then
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByText("Languages")).toBeInTheDocument();
    expect(screen.getByText("Editors")).toBeInTheDocument();
  });

  it("should leave the ranking of people to the contributors tab", async () => {
    // given
    // A name is not a question about the fleet, and a ranking is a way into a
    // row — a tab away from the rows it ranks it is only a list.
    const contributors = [measured("alice", 36_000)];

    // when
    await render(<WakaTimeFleetInsights contributors={contributors} />);

    // then
    expect(screen.queryByText("Who spent the time")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Where the time went, by repository"),
    ).not.toBeInTheDocument();
  });

  it("should explain an empty fleet rather than drawing empty charts", async () => {
    // given
    // A freshly configured WakaTime has collected nothing until the nightly
    // pass, and a blank card reads as a fault.
    const contributors = [ContributorBuilder.create().build()];

    // when
    await render(<WakaTimeFleetInsights contributors={contributors} />);

    // then
    // Once under Languages and once under Editors.
    expect(
      screen.getAllByText("No coding time was recorded in this window."),
    ).toHaveLength(2);
    expect(
      screen.getByText(/WakaTime reported no category breakdown/u),
    ).toBeInTheDocument();
  });
});

describe("WakaTimeContributorInsights", () => {
  it("should rank the people who spent the time", async () => {
    // given
    const contributors = [measured("alice", 36_000), measured("bob", 3600)];

    // when
    await render(<WakaTimeContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByText("Who spent the time")).toBeInTheDocument();
    expect(screen.getByLabelText(/^alice: 10h of coding time/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/^bob: 1h of coding time/u)).toBeInTheDocument();
  });

  it("should send a row to the plugin's contributor page, not to the catalog", async () => {
    // given
    // The reader of a coding-time ranking is already asking what somebody did,
    // which is the detail page's question rather than the catalog's.
    const contributors = [measured("alice", 36_000)];

    // when
    await render(<WakaTimeContributorInsights contributors={contributors} />);

    // then
    expect(screen.getByRole("link", { name: "alice" })).toHaveAttribute(
      "href",
      "/contributors/person?key=alice",
    );
  });

  it("should say nobody logged any time rather than drawing an empty chart", async () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    await render(<WakaTimeContributorInsights contributors={contributors} />);

    // then
    expect(
      screen.getByText("Nobody logged any coding time in this window."),
    ).toBeInTheDocument();
  });
});

describe("WakaTimeRepositoryInsights", () => {
  const gateway = {
    ...RepositoryBuilder.create().withId("gateway-id").withName("gateway").build(),
    wakaTimeMetrics: {
      projectName: "gateway",
      window: { from: "2026-08-01", to: "2026-08-10" },
      totalSeconds: 7200,
      contributors: 2,
      daily: [],
    },
  };

  it("should rank the repositories the time went into", async () => {
    // given / when
    await render(<WakaTimeRepositoryInsights repositories={[gateway]} />);

    // then
    expect(screen.getByText("Where the time went, by repository")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/^gateway: 2h of coding time, 2 people$/u),
    ).toBeInTheDocument();
  });

  it("should send a row to the plugin's repository page", async () => {
    // given / when
    await render(<WakaTimeRepositoryInsights repositories={[gateway]} />);

    // then
    expect(screen.getByRole("link", { name: "gateway" })).toHaveAttribute(
      "href",
      "/repositories/gateway-id",
    );
  });

  it("should say why no repository matched a WakaTime project", async () => {
    // given
    // A project named differently from the repository is the usual cause, and
    // it is closed by an annotation rather than by waiting.
    await render(<WakaTimeRepositoryInsights repositories={[]} />);

    // then
    expect(
      screen.getByText(/No repository matched a WakaTime project/u),
    ).toBeInTheDocument();
  });
});
