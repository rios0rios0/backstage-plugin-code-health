import {
  categoryBreakdown,
  codingTimeSeries,
  editorBreakdown,
  formatOptionalDuration,
  languageBreakdown,
  topContributorsByCodingTime,
  topRepositoriesByCodingTime,
  wakaTimeKpis,
} from "../../../src/domain/entities/wakatime_insights";
import { ContributorBuilder, WakaTimeBuilder } from "../../builders/contributor_builder";
import { RepositoryBuilder } from "../../builders/repository_builder";

const measured = (name: string, seconds: number) =>
  ContributorBuilder.create()
    .withDisplayName(name)
    .withWakaTimeMetrics(WakaTimeBuilder.create().withTotalSeconds(seconds).build())
    .build();

describe("wakaTimeKpis", () => {
  it("should total the fleet's coding time and average it over the people who logged any", () => {
    // given
    // Dividing by everybody who committed would make the figure fall whenever
    // somebody without WakaTime installed pushes a commit, which says nothing
    // about how the team works.
    const contributors = [
      measured("alice", 7200),
      measured("bob", 3600),
      ContributorBuilder.create().withDisplayName("carol").build(),
    ];

    // when
    const kpis = wakaTimeKpis(contributors);

    // then
    expect(kpis.totalSeconds).toBe(10_800);
    expect(kpis.measuredContributors).toBe(2);
    expect(kpis.averageSecondsPerContributor).toBe(5400);
  });

  it("should report no average when nobody logged anything", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    const kpis = wakaTimeKpis(contributors);

    // then
    expect(kpis.averageSecondsPerContributor).toBeNull();
    expect(kpis.topLanguage).toBeNull();
    expect(kpis.topEditor).toBeNull();
  });

  it("should name the language and editor the fleet spent most time in", () => {
    // given
    const contributors = [measured("alice", 7200), measured("bob", 3600)];

    // when
    const kpis = wakaTimeKpis(contributors);

    // then
    expect(kpis.topLanguage?.name).toBe("TypeScript");
    expect(kpis.topEditor?.name).toBe("VS Code");
  });

  it("should leave the AI figures null when nobody collected them", () => {
    // given
    // "Nobody has the AI collection switched on" and "everybody writes their own
    // code" are different answers, and only one of them is about the team.
    const contributors = [measured("alice", 7200)];

    // when
    const kpis = wakaTimeKpis(contributors);

    // then
    expect(kpis.aiAuthorshipPercent).toBeNull();
    expect(kpis.aiTokens).toBeNull();
  });

  it("should share out AI authorship across everybody who collected it", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withWakaTimeMetrics(
          WakaTimeBuilder.create()
            .withAi({ linesAddedByAi: 30, linesAddedByHuman: 70, inputTokens: 1000 })
            .build(),
        )
        .build(),
      ContributorBuilder.create()
        .withDisplayName("bob")
        .withWakaTimeMetrics(
          WakaTimeBuilder.create()
            .withAi({ linesAddedByAi: 10, linesAddedByHuman: 90, outputTokens: 500 })
            .build(),
        )
        .build(),
    ];

    // when
    const kpis = wakaTimeKpis(contributors);

    // then
    expect(kpis.aiAuthorshipPercent).toBe(20);
    expect(kpis.aiTokens).toBe(1500);
  });

  it("should report zero percent when the AI figures were collected and were zero", () => {
    // given
    // Collected-and-zero is a real measurement, and it has to read differently
    // from never collected.
    const contributors = [
      ContributorBuilder.create()
        .withWakaTimeMetrics(
          WakaTimeBuilder.create().withAi({ linesAddedByHuman: 100 }).build(),
        )
        .build(),
    ];

    // when / then
    expect(wakaTimeKpis(contributors).aiAuthorshipPercent).toBe(0);
  });
});

describe("the fleet breakdowns", () => {
  it("should rank languages by merged total, not by an average of percentages", () => {
    // given
    const contributors = [measured("alice", 7200), measured("bob", 3600)];

    // when
    const languages = languageBreakdown(contributors);

    // then
    expect(languages).toEqual([
      { id: "TypeScript", label: "TypeScript", value: 60_000, detail: "100%", entityRef: null, avatarUrl: null },
    ]);
  });

  it("should rank editors and categories the same way", () => {
    // given
    const contributors = [measured("alice", 7200)];

    // when / then
    expect(editorBreakdown(contributors)[0]?.label).toBe("VS Code");
    expect(categoryBreakdown(contributors)[0]?.label).toBe("Coding");
  });

  it("should return nothing when no coding time was recorded", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when / then
    expect(languageBreakdown(contributors)).toEqual([]);
    expect(categoryBreakdown(contributors)).toEqual([]);
  });
});

describe("topContributorsByCodingTime", () => {
  it("should rank by hours in an editor, which is a different order from commits", () => {
    // given
    const contributors = [
      { ...measured("alice", 3600), commits: 100 },
      { ...measured("bob", 36_000), commits: 1 },
    ];

    // when
    const ranking = topContributorsByCodingTime(contributors);

    // then
    expect(ranking.map((item) => item.label)).toEqual(["bob", "alice"]);
    expect(ranking[0]?.detail).toBe("8 active days");
  });

  it("should drop somebody who logged nothing rather than padding the chart", () => {
    // given
    const contributors = [measured("alice", 0), measured("bob", 60)];

    // when / then
    expect(topContributorsByCodingTime(contributors).map((item) => item.label)).toEqual(["bob"]);
  });

  it("should say `day` for a single active day", () => {
    // given
    const contributor = ContributorBuilder.create()
      .withDisplayName("alice")
      .withWakaTimeMetrics({
        ...WakaTimeBuilder.create().build(),
        activeDays: 1,
      })
      .build();

    // when / then
    expect(topContributorsByCodingTime([contributor])[0]?.detail).toBe("1 active day");
  });
});

describe("topRepositoriesByCodingTime", () => {
  it("should rank repositories by the time logged against their project", () => {
    // given
    const busy = {
      ...RepositoryBuilder.create().withName("busy").build(),
      wakaTimeMetrics: {
        projectName: "busy",
        window: { from: "2026-08-01", to: "2026-08-10" },
        totalSeconds: 7200,
        contributors: 3,
        daily: [],
      },
    };
    const quiet = {
      ...RepositoryBuilder.create().withName("quiet").build(),
      wakaTimeMetrics: {
        projectName: "quiet",
        window: { from: "2026-08-01", to: "2026-08-10" },
        totalSeconds: 60,
        contributors: 1,
        daily: [],
      },
    };
    const unmatched = RepositoryBuilder.create().withName("unmatched").build();

    // when
    const ranking = topRepositoriesByCodingTime([quiet, busy, unmatched]);

    // then
    expect(ranking.map((item) => item.label)).toEqual(["busy", "quiet"]);
    expect(ranking[0]?.detail).toBe("3 people");
    expect(ranking[1]?.detail).toBe("1 person");
  });
});

describe("codingTimeSeries", () => {
  it("should sum the fleet's day series and count who was active on each day", () => {
    // given
    // Summed in the browser from the series each row already carries, so the
    // trend costs no extra request.
    const contributors = [measured("alice", 12_600), measured("bob", 12_600)];

    // when
    const series = codingTimeSeries(contributors);

    // then
    expect(series).toEqual([
      { day: "2026-08-05", totalSeconds: 18_000, contributors: 2 },
      { day: "2026-08-06", totalSeconds: 7200, contributors: 2 },
    ]);
  });

  it("should return nothing when nobody has coding time", () => {
    // given / when / then
    expect(codingTimeSeries([ContributorBuilder.create().build()])).toEqual([]);
  });
});

describe("formatOptionalDuration", () => {
  it("should render an em dash rather than zero for an unmeasured figure", () => {
    // given / when / then
    expect(formatOptionalDuration(null)).toBe("—");
    expect(formatOptionalDuration(3600)).toBe("1h");
  });
});
