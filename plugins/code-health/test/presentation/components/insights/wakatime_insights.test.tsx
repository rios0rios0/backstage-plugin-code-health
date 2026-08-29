import { render as renderBare, screen } from "@testing-library/react";
import Grid from "@material-ui/core/Grid";
import { MemoryRouter } from "react-router-dom";
import { WakaTimeInsights } from "../../../../src/presentation/components/insights/wakatime_insights";
import {
  ContributorBuilder,
  WakaTimeBuilder,
} from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

/** The cards are `<Grid item>` children, so they mount inside a container. */
const render = (ui: React.ReactElement) =>
  renderBare(
    <MemoryRouter>
      <Grid container>{ui}</Grid>
    </MemoryRouter>,
  );

const measured = (name: string, seconds: number) =>
  ContributorBuilder.create()
    .withDisplayName(name)
    .withWakaTimeMetrics(WakaTimeBuilder.create().withTotalSeconds(seconds).build())
    .build();

describe("WakaTimeInsights", () => {
  it("should headline the fleet's coding time and its shape", () => {
    // given
    const contributors = [measured("alice", 36_000), measured("bob", 7200)];

    // when
    render(<WakaTimeInsights repositories={[]} contributors={contributors} />);

    // then
    expect(screen.getByText("12h")).toBeInTheDocument();
    expect(screen.getByText("2 measured")).toBeInTheDocument();
    // Twice each: once as the headline tile, once as a bar in the breakdown.
    expect(screen.getAllByText("TypeScript")).toHaveLength(2);
    expect(screen.getAllByText("VS Code")).toHaveLength(2);
  });

  it("should report the AI figures as unmeasured rather than as zero", () => {
    // given
    // Empty means the AI collection was never switched on, not that nobody
    // used AI, and the two want different reactions.
    const contributors = [measured("alice", 3600)];

    // when
    render(<WakaTimeInsights repositories={[]} contributors={contributors} />);

    // then
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("should show the AI share and tokens once they are collected", () => {
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
    render(<WakaTimeInsights repositories={[]} contributors={[contributor]} />);

    // then
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("900.0k")).toBeInTheDocument();
  });

  it("should name the busiest day", () => {
    // given
    const contributors = [measured("alice", 12_600)];

    // when
    render(<WakaTimeInsights repositories={[]} contributors={contributors} />);

    // then
    expect(screen.getByText(/Busiest day: 2026-08-05/u)).toBeInTheDocument();
  });

  it("should rank the people who spent the time", () => {
    // given
    const contributors = [measured("alice", 36_000), measured("bob", 3600)];

    // when
    render(<WakaTimeInsights repositories={[]} contributors={contributors} />);

    // then
    const ranking = screen.getByLabelText(/^alice: 10h of coding time/u);
    expect(ranking).toBeInTheDocument();
    expect(screen.getByLabelText(/^bob: 1h of coding time/u)).toBeInTheDocument();
  });

  it("should rank the repositories the time went into", () => {
    // given
    const repository = {
      ...RepositoryBuilder.create().withName("gateway").build(),
      wakaTimeMetrics: {
        projectName: "gateway",
        window: { from: "2026-08-01", to: "2026-08-10" },
        totalSeconds: 7200,
        contributors: 2,
        daily: [],
      },
    };

    // when
    render(<WakaTimeInsights repositories={[repository]} contributors={[]} />);

    // then
    expect(screen.getByLabelText(/^gateway: 2h of coding time, 2 people$/u)).toBeInTheDocument();
  });

  it("should explain an empty fleet rather than drawing empty charts", () => {
    // given
    // A freshly configured WakaTime has collected nothing until the nightly
    // pass, and a blank card reads as a fault.
    const contributors = [ContributorBuilder.create().build()];

    // when
    render(<WakaTimeInsights repositories={[]} contributors={contributors} />);

    // then
    // Once under Languages and once under Editors.
    expect(
      screen.getAllByText("No coding time was recorded in this window."),
    ).toHaveLength(2);
    expect(
      screen.getByText(/No repository matched a WakaTime project/u),
    ).toBeInTheDocument();
  });
});
