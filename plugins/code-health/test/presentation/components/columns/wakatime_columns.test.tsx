import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { fireEvent, render as renderBare, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContributorsTable } from "../../../../src/presentation/components/contributors_table";
import { RepositoryTable } from "../../../../src/presentation/components/repository_table";
import {
  hasAiMetrics,
  wakaTimeAiColumns,
  wakaTimeContributorColumns,
  wakaTimeRepositoryColumns,
} from "../../../../src/presentation/components/columns/wakatime_columns";
import {
  ContributorBuilder,
  WakaTimeBuilder,
} from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

const wakatimeOn = { ...NO_INTEGRATIONS, wakatime: true };

const renderContributors = (contributors: ReturnType<ContributorBuilder["build"]>[]) =>
  render(
    <ContributorsTable
      contributors={contributors}
      totalCount={contributors.length}
      isLoading={false}
      capabilities={wakatimeOn}
    />,
  );

describe("wakaTimeContributorColumns", () => {
  it("should build a column group rather than a constant", () => {
    // given / when
    // A factory, so nothing is built for an integration the backend was never
    // configured with.
    const first = wakaTimeContributorColumns();
    const second = wakaTimeContributorColumns();

    // then
    expect(first).not.toBe(second);
    expect(first.map((column) => column.id)).toEqual([
      "codingTime",
      "activeDays",
      "topLanguage",
      "branchesTouched",
      "filesTouched",
    ]);
  });

  it("should show the time, the average, the language and the branches", () => {
    // given
    const contributor = ContributorBuilder.create()
      .withDisplayName("alice")
      .withWakaTimeMetrics(
        WakaTimeBuilder.create()
          .withTotalSeconds(36_000)
          .withBranches(["main", "feat/x"])
          .build(),
      )
      .build();

    // when
    renderContributors([contributor]);

    // then
    expect(screen.getByText("10h")).toBeInTheDocument();
    expect(screen.getByText("1h/day")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("should report active days as a share of the days the window covers", () => {
    // given
    // A high total spread over two days and the same total spread over ten are
    // different weeks.
    const contributor = ContributorBuilder.create()
      .withWakaTimeMetrics(WakaTimeBuilder.create().build())
      .build();

    // when
    renderContributors([contributor]);

    // then
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("of 10")).toBeInTheDocument();
  });

  it("should leave the file count empty when the plan does not report it", () => {
    // given
    // Zero files edited by somebody who demonstrably spent eleven hours in an
    // editor is the wrong answer to report.
    const contributor = ContributorBuilder.create()
      .withWakaTimeMetrics(WakaTimeBuilder.create().withoutFileCount().build())
      .build();

    // when
    renderContributors([contributor]);

    // then
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("should leave every cell empty for somebody with no WakaTime account", () => {
    // given
    const contributor = ContributorBuilder.create().build();

    // when
    renderContributors([contributor]);

    // then
    expect(screen.queryByText("10h")).not.toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(5);
  });
});

describe("wakaTimeAiColumns", () => {
  it("should show tokens split into input and output", () => {
    // given
    const contributor = ContributorBuilder.create()
      .withWakaTimeMetrics(
        WakaTimeBuilder.create()
          .withAi({
            inputTokens: 1_200_000,
            outputTokens: 300_000,
            linesAddedByAi: 40,
            linesAddedByHuman: 60,
            prompts: 12,
          })
          .build(),
      )
      .build();

    // when
    renderContributors([contributor]);

    // then
    expect(screen.getByText("1.5M")).toBeInTheDocument();
    expect(screen.getByText("1.2M in / 300.0k out")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("12 prompts")).toBeInTheDocument();
  });

  it("should leave the AI share empty when nothing was written at all", () => {
    // given
    // Nobody wrote anything is not the same as a human wrote everything.
    const contributor = ContributorBuilder.create()
      .withWakaTimeMetrics(WakaTimeBuilder.create().withAi({ prompts: 3 }).build())
      .build();

    // when
    renderContributors([contributor]);

    // then
    expect(screen.getByText("3 prompts")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("should name its columns", () => {
    // given / when / then
    expect(wakaTimeAiColumns().map((column) => column.id)).toEqual([
      "aiTokens",
      "aiAuthorship",
    ]);
  });
});

describe("sorting on a WakaTime column", () => {
  const sortBy = (heading: string) => {
    fireEvent.click(screen.getByText(heading));
  };

  const rows = () =>
    screen
      .getAllByRole("row")
      .slice(2)
      .map((row) => row.querySelector("td")?.textContent ?? "");

  it("should sort an unmeasured contributor below every measured one", () => {
    // given
    // The accessors report -1 rather than 0 for an unmeasured row, so somebody
    // with no WakaTime account never outranks somebody who logged nothing.
    const measured = ContributorBuilder.create()
      .withDisplayName("measured")
      .withWakaTimeMetrics(WakaTimeBuilder.create().withTotalSeconds(0).build())
      .build();
    const unmeasured = ContributorBuilder.create().withDisplayName("unmeasured").build();
    renderContributors([unmeasured, measured]);

    // when
    sortBy("Coding time");

    // then
    expect(rows()[0]).toContain("measured");
  });

  it("should sort on every WakaTime column without throwing", () => {
    // given
    const busy = ContributorBuilder.create()
      .withDisplayName("busy")
      .withWakaTimeMetrics(
        WakaTimeBuilder.create()
          .withTotalSeconds(36_000)
          .withBranches(["main", "feat/x"])
          .withAi({ inputTokens: 100, linesAddedByAi: 1, linesAddedByHuman: 1 })
          .build(),
      )
      .build();
    const quiet = ContributorBuilder.create()
      .withDisplayName("quiet")
      .withWakaTimeMetrics(
        WakaTimeBuilder.create().withTotalSeconds(60).withoutFileCount().build(),
      )
      .build();
    renderContributors([quiet, busy]);

    // when / then
    for (const heading of ["Active days", "Language", "Branches", "Files", "AI tokens", "AI lines"]) {
      sortBy(heading);
      expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
    }
  });

  it("should sort a contributor with no AI figures below one with them", () => {
    // given
    const withAi = ContributorBuilder.create()
      .withDisplayName("with-ai")
      .withWakaTimeMetrics(WakaTimeBuilder.create().withAi({ inputTokens: 0 }).build())
      .build();
    const withoutAi = ContributorBuilder.create()
      .withDisplayName("without-ai")
      .withWakaTimeMetrics(WakaTimeBuilder.create().build())
      .build();
    renderContributors([withoutAi, withAi]);

    // when
    sortBy("AI tokens");

    // then
    expect(rows()[0]).toContain("with-ai");
  });
});

describe("hasAiMetrics", () => {
  it("should be true only when a row actually carries AI figures", () => {
    // given
    const without = ContributorBuilder.create()
      .withWakaTimeMetrics(WakaTimeBuilder.create().build())
      .build();
    const with_ = ContributorBuilder.create()
      .withWakaTimeMetrics(WakaTimeBuilder.create().withAi().build())
      .build();

    // when / then
    expect(hasAiMetrics([without])).toBe(false);
    expect(hasAiMetrics([with_])).toBe(true);
    expect(hasAiMetrics([ContributorBuilder.create().build()])).toBe(false);
  });
});

describe("wakaTimeRepositoryColumns", () => {
  it("should show the project's time and how many people logged it", () => {
    // given
    const repository = {
      ...RepositoryBuilder.create().withName("gateway").build(),
      wakaTimeMetrics: {
        projectName: "gateway",
        window: { from: "2026-08-01", to: "2026-08-10" },
        totalSeconds: 7200,
        contributors: 3,
        daily: [],
      },
    };

    // when
    render(
      <RepositoryTable
        repositories={[repository]}
        totalCount={1}
        isLoading={false}
        capabilities={wakatimeOn}
      />,
    );

    // then
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByText("3 people")).toBeInTheDocument();
  });

  it("should say `person` for a single contributor", () => {
    // given
    const repository = {
      ...RepositoryBuilder.create().withName("gateway").build(),
      wakaTimeMetrics: {
        projectName: "gateway",
        window: { from: "2026-08-01", to: "2026-08-10" },
        totalSeconds: 60,
        contributors: 1,
        daily: [],
      },
    };

    // when
    render(
      <RepositoryTable
        repositories={[repository]}
        totalCount={1}
        isLoading={false}
        capabilities={wakatimeOn}
      />,
    );

    // then
    expect(screen.getByText("1 person")).toBeInTheDocument();
  });

  it("should leave a repository nothing matched empty rather than at zero", () => {
    // given
    // "Nobody here has WakaTime installed" and "the project is called something
    // else" are different problems, and a zero would hide both.
    const repository = RepositoryBuilder.create().withName("unmatched").build();

    // when
    render(
      <RepositoryTable
        repositories={[repository]}
        totalCount={1}
        isLoading={false}
        capabilities={wakatimeOn}
      />,
    );

    // then
    expect(wakaTimeRepositoryColumns()).toHaveLength(1);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });
});
