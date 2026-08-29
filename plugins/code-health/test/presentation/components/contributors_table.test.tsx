import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { render as renderBare, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContributorsTable } from "../../../src/presentation/components/contributors_table";
import {
  ContributorBuilder,
  WakaTimeBuilder,
} from "../../builders/contributor_builder";

// A contributor linked to a catalog user renders a router `Link`, so these mount
// inside a router — which is how the app renders the table.
const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

describe("ContributorsTable", () => {
  it("should link a contributor to their catalog user", async () => {
    // given
    // The catalog page is the destination rather than the provider profile: it
    // carries ownership, group membership and the rest of the person's entity.
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("Dev Eloper")
        .withEntityRef("user:default/dev_example.com")
        .build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    const link = screen.getByText("Dev Eloper").closest("a");
    expect(link).toHaveAttribute("href", "/catalog/default/user/dev_example.com");
  });

  it("should fall back to the provider profile when no catalog user matched", async () => {
    // given
    // Bots and commits from a personal address resolve to no entity, and linking
    // them into the catalog would point at a page that does not exist.
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("ci-bot")
        .withEntityRef(null)
        .withProfileUrl("https://github.com/ci-bot")
        .build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    expect(screen.getByText("ci-bot").closest("a")).toHaveAttribute(
      "href",
      "https://github.com/ci-bot",
    );
  });

  it("should show initials when the catalog user has no picture", async () => {
    // given
    // Most directories populate a photo for only some of their people; a generic
    // silhouette would make every unphotographed contributor look identical.
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("Ada Lovelace")
        .withAvatarUrl(null)
        .withEntityRef("user:default/ada")
        .build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  const defaultProps = {
    totalCount: 0,
    isLoading: false,
  };

  it("should render 'No contributors found.' when contributors is empty", () => {
    // given / when
    render(<ContributorsTable {...defaultProps} contributors={[]} />);

    // then
    expect(screen.getByText("No contributors found.")).toBeInTheDocument();
  });

  it("should render loading skeleton when isLoading is true", () => {
    // given / when
    const { container } = render(
      <ContributorsTable {...defaultProps} contributors={[]} isLoading />,
    );

    // then
    const skeletonRows = container.querySelectorAll("[data-testid=\"loadingRow\"]");
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it("should render contributor rows with avatar, displayName, PR counts, and LOC", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withReviewsApproved(8)
        .withLinesOfCode(5000)
        .build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
      />,
    );

    // then
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("5,000")).toBeInTheDocument();
  });

  it("should render approval rate with green color for rate >= 80", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withPrApprovalRate(85).build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
      />,
    );

    // then
    const rateEl = screen.getByText("85.0%");
    expect(rateEl.getAttribute("data-tone")).toBe("good");
  });

  it("should render approval rate with yellow color for rate >= 50 and < 80", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withPrApprovalRate(65).build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
      />,
    );

    // then
    const rateElements = screen.getAllByText("65.0%");
    const approvalRateEl = rateElements[0];
    expect(approvalRateEl.getAttribute("data-tone")).toBe("fair");
  });

  it("should render approval rate with red color for rate < 50", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withPrApprovalRate(30).build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
      />,
    );

    // then
    const rateElements = screen.getAllByText("30.0%");
    const approvalRateEl = rateElements[0];
    expect(approvalRateEl.getAttribute("data-tone")).toBe("poor");
  });

  it("should show the WakaTime columns when the integration is configured", () => {
    // given
    // Driven by configuration, not by the data: a WakaTime that was switched on
    // this morning has collected nothing until the nightly pass, and hiding its
    // columns until then makes a working install look broken.
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("alice")
        .withWakaTimeMetrics(WakaTimeBuilder.create().withTotalSeconds(3600).build())
        .build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        capabilities={{ ...NO_INTEGRATIONS, wakatime: true }}
      />,
    );

    // then
    expect(screen.getByText("Coding time")).toBeInTheDocument();
    expect(screen.getByText("Active days")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
  });

  it("should show the WakaTime columns even before anything was collected", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={1}
        isLoading={false}
        capabilities={{ ...NO_INTEGRATIONS, wakatime: true }}
      />,
    );

    // then
    expect(screen.getByText("Coding time")).toBeInTheDocument();
    // And the cells read as unmeasured rather than as zero hours worked.
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("should show the AI columns only once a row actually carries them", () => {
    // given
    // The AI figures are collected separately and opting out of them is a
    // supported way to run WakaTime, so a screen of em dashes would read as a
    // fault rather than as a choice.
    const withAi = ContributorBuilder.create()
      .withDisplayName("alice")
      .withWakaTimeMetrics(
        WakaTimeBuilder.create()
          .withAi({ inputTokens: 1200, outputTokens: 300, linesAddedByAi: 30, linesAddedByHuman: 70 })
          .build(),
      )
      .build();
    const withoutAi = ContributorBuilder.create()
      .withDisplayName("bob")
      .withWakaTimeMetrics(WakaTimeBuilder.create().build())
      .build();
    const capabilities = { ...NO_INTEGRATIONS, wakatime: true };

    // when
    const { rerender } = render(
      <ContributorsTable
        contributors={[withoutAi]}
        totalCount={1}
        isLoading={false}
        capabilities={capabilities}
      />,
    );

    // then
    expect(screen.queryByText("AI tokens")).not.toBeInTheDocument();

    // when
    rerender(
      <ContributorsTable
        contributors={[withAi]}
        totalCount={1}
        isLoading={false}
        capabilities={capabilities}
      />,
    );

    // then
    expect(screen.getByText("AI tokens")).toBeInTheDocument();
    expect(screen.getByText("1.5k")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("should hide the WakaTime columns when the integration is not configured", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withWakaTimeMetrics(WakaTimeBuilder.create().build())
        .build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    expect(screen.queryByText("Coding time")).not.toBeInTheDocument();
  });

  it("should name the systems merged onto one row", () => {
    // given
    // A total nobody can trace back to its sources is a number nobody trusts.
    const contributor = ContributorBuilder.create()
      .withDisplayName("alice")
      .withIdentities([
        { source: "vcs", sourceKey: "alice@example.com", displayName: "Alice" },
        { source: "wakatime", sourceKey: "alice", displayName: null },
      ])
      .build();

    // when
    render(
      <ContributorsTable contributors={[contributor]} totalCount={1} isLoading={false} />,
    );

    // then
    expect(screen.getByText("vcs · wakatime")).toBeInTheDocument();
  });

  it("should render contributor count", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("a").build(),
      ContributorBuilder.create().withDisplayName("b").build(),
    ];

    // when
    render(
      <ContributorsTable
        contributors={contributors}
        totalCount={5}
        isLoading={false}
      />,
    );

    // then
    expect(screen.getByText(/2 of 5 contributors/)).toBeInTheDocument();
  });

  it("should show a dash in every Sonar cell of a contributor with no metrics", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("unmeasured").build(),
    ];
    const sonarHeaders = ["Bugs", "Smells", "Vulns", "Hotspots", "Coverage", "Dups", "Debt"];

    // when
    render(<ContributorsTable {...defaultProps} contributors={contributors} totalCount={1} />);

    // then
    const headerCells = screen.getAllByRole("columnheader");
    const dataCells = within(screen.getAllByRole("row")[2]).getAllByRole("cell");
    for (const header of sonarHeaders) {
      const index = headerCells.findIndex((cell) => cell.textContent?.includes(header));
      expect(dataCells[index]).toHaveTextContent("-");
    }
  });

  it("should render coverage, duplications and debt when Sonar measured the contributor", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("measured")
        .withSonarMetrics({
          bugs: 1,
          codeSmells: 2,
          securityHotspots: 3,
          vulnerabilities: 4,
          coverage: 87.5,
          duplications: 3.25,
          technicalDebt: "2h 15min",
          technicalDebtMinutes: 135,
          qualityGateStatus: "OK",
        })
        .build(),
    ];

    // when
    render(<ContributorsTable {...defaultProps} contributors={contributors} totalCount={1} />);

    // then
    expect(screen.getByText("87.5%")).toBeInTheDocument();
    expect(screen.getByText("3.3%")).toBeInTheDocument();
    expect(screen.getByText("2h 15min")).toBeInTheDocument();
  });

  it("should leave the WakaTime cells empty for a contributor with no tracked time", () => {
    // given
    const tracked = ContributorBuilder.create().withDisplayName("tracked").build();
    const untracked = ContributorBuilder.create().withDisplayName("untracked").build();
    const contributors = [
      {
        ...tracked,
        wakaTimeMetrics: WakaTimeBuilder.create().withTotalSeconds(9000).build(),
      },
      untracked,
    ];

    // when
    render(
      <ContributorsTable
        {...defaultProps}
        contributors={contributors}
        totalCount={2}
        capabilities={{ ...NO_INTEGRATIONS, wakatime: true }}
      />,
    );

    // then
    expect(screen.getByText("2h 30m")).toBeInTheDocument();
    // The untracked row reads as unmeasured, never as zero hours worked.
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("should page through more contributors than fit on one page", () => {
    // given
    const contributors = Array.from({ length: 30 }, (_, index) =>
      ContributorBuilder.create()
        .withDisplayName(`user-${String(index).padStart(2, "0")}`)
        .withLinesOfCode(index)
        .build(),
    );
    render(
      <ContributorsTable {...defaultProps} contributors={contributors} totalCount={30} />,
    );

    // when
    fireEvent.click(screen.getByText("Next"));

    // then
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    // when
    fireEvent.click(screen.getByText("Previous"));

    // then
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});

describe("ContributorsTable churn and pull request columns", () => {
  it("should show net lines with the additions and deletions underneath", () => {
    // given
    const contributors = [ContributorBuilder.create().withDisplayName("Dev").build()];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    expect(screen.getByText("+700")).toBeInTheDocument();
    expect(screen.getByText("-300")).toBeInTheDocument();
  });

  it("should count files when the provider reported no line counts", () => {
    // given
    // Azure DevOps carries added, edited and deleted *files* and exposes no
    // line count anywhere in its REST API, so a lines column against an Azure
    // DevOps fleet reads zero on every row.
    const contributors = [
      ContributorBuilder.create().withDisplayName("Dev").withFileChurn(42).build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("files changed")).toBeInTheDocument();
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
  });

  it("should show nothing at all when the provider reported no churn", () => {
    // given
    const contributors = [
      ContributorBuilder.create().withDisplayName("Dev").withoutChurn().build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    // "The provider said zero" and "the provider never said" are different
    // facts, and printing 0 for the second is the bug this cell prevents.
    expect(screen.queryByText("files changed")).not.toBeInTheDocument();
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
  });

  it("should report created pull requests apart from reviewed ones", () => {
    // given
    const contributors = [
      ContributorBuilder.create()
        .withDisplayName("Dev")
        .withPullRequests(14, 11)
        .build(),
    ];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    // The old single column read "Approved PRs" over a review count, which is
    // not the person's own pull requests at all.
    expect(screen.getByText("PRs created")).toBeInTheDocument();
    expect(screen.getByText("PRs approved")).toBeInTheDocument();
    expect(screen.getByText("/ 11 merged")).toBeInTheDocument();
    expect(screen.getByText("/ 10 reviewed")).toBeInTheDocument();
  });

  it("should explain the approval rate and the pipeline column", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    // Both divide two numbers the heading does not name, and a reader who
    // guesses wrong reads the column backwards.
    expect(
      screen.getByRole("img", { name: /the share they approved/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /pipeline runs requested for this person/ }),
    ).toBeInTheDocument();
  });
});

describe("ContributorsTable header tooltips", () => {
  it("should make every help tooltip reachable from the keyboard", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    // Two separate failures are guarded here. An icon with no accessible name
    // is stamped `aria-hidden` by `SvgIcon`, so a screen reader is told to skip
    // it however it is labelled — `getAllByRole` would find nothing at all. And
    // an SVG has no focus event of its own, so without a tab stop the tooltip
    // never opens for anybody not using a pointer.
    // Filtered to the icons: a contributor avatar is an `img` too.
    const helps = screen
      .getAllByRole("img")
      .filter((element) => element.tagName.toLowerCase() === "svg");
    expect(helps).toHaveLength(5);
    for (const help of helps) {
      expect(help).toHaveAttribute("tabindex", "0");
      expect(help).not.toHaveAttribute("aria-hidden", "true");
    }
  });

  it("should not promise a negative churn figure it cannot show", () => {
    // given
    const contributors = [ContributorBuilder.create().build()];

    // when
    render(
      <ContributorsTable contributors={contributors} totalCount={1} isLoading={false} />,
    );

    // then
    // `linesOfCode` is floored at zero, so wording that implies a negative net
    // is describing a value the column can never render.
    expect(screen.getByRole("img", { name: /floored at zero/ })).toBeInTheDocument();
  });
});
