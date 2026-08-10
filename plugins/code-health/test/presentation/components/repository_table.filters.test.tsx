import { fireEvent, render, screen, within } from "@testing-library/react";
import { RepositoryTable } from "../../../src/presentation/components/repository_table";
import type { BadgeStatus, ComplianceStatus } from "@rios0rios0/backstage-plugin-code-health-common";
import type { Repository } from "../../../src/domain/entities/repository";
import { RepositoryBuilder } from "../../builders/repository_builder";

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const compliance = (color: ComplianceStatus["color"]): ComplianceStatus => ({
  color,
  pipelineExists: true,
  buildPolicyOnPRs: true,
  buildPolicyExpiration: true,
  branchProtection: true,
});

const badges = (color: BadgeStatus["color"]): BadgeStatus => ({
  color,
  checks: [],
});

const renderTable = (repositories: Repository[]) =>
  render(
    <RepositoryTable
      repositories={repositories}
      totalCount={repositories.length}
      isLoading={false}
    />,
  );

const selectFilter = (columnId: string, value: string) =>
  fireEvent.change(screen.getByLabelText(`Filter ${columnId}`), { target: { value } });

const visibleRepositoryNames = (): string[] =>
  screen
    .getAllByRole("row")
    .slice(2)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");

describe("RepositoryTable column filters", () => {
  it("should keep only passing repositories when the CI filter is 'passing'", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("green").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("red").withCiStatus("FAILURE").build(),
      RepositoryBuilder.create().withName("none").build(),
    ]);

    // when
    selectFilter("ciStatus", "passing");

    // then
    expect(visibleRepositoryNames().join()).toContain("green");
    expect(visibleRepositoryNames().join()).not.toContain("red");
  });

  it("should keep only broken repositories when the CI filter is 'failing'", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("green").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("red").withCiStatus("FAILURE").build(),
      RepositoryBuilder.create().withName("none").build(),
    ]);

    // when
    selectFilter("ciStatus", "failing");

    // then
    const names = visibleRepositoryNames().join();
    expect(names).toContain("red");
    expect(names).not.toContain("green");
    expect(names).not.toContain("none");
  });

  it("should keep only repositories without CI when the CI filter is 'no-ci'", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("green").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("none").build(),
    ]);

    // when
    selectFilter("ciStatus", "no-ci");

    // then
    const names = visibleRepositoryNames().join();
    expect(names).toContain("none");
    expect(names).not.toContain("green");
  });

  it("should keep every repository when the CI filter is reset to 'all'", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("green").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("none").build(),
    ]);
    selectFilter("ciStatus", "passing");

    // when
    selectFilter("ciStatus", "all");

    // then
    expect(visibleRepositoryNames()).toHaveLength(2);
  });

  it("should filter by compliance colour", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("compliant").withComplianceStatus(compliance("green")).build(),
      RepositoryBuilder.create().withName("failing").withComplianceStatus(compliance("red")).build(),
      RepositoryBuilder.create().withName("unchecked").build(),
    ]);

    // when
    selectFilter("compliance", "green");

    // then
    expect(visibleRepositoryNames()).toHaveLength(1);
    expect(visibleRepositoryNames()[0]).toContain("compliant");
  });

  it("should filter by badge colour", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("badged").withBadgeStatus(badges("green")).build(),
      RepositoryBuilder.create().withName("partial").withBadgeStatus(badges("yellow")).build(),
    ]);

    // when
    selectFilter("badges", "yellow");

    // then
    expect(visibleRepositoryNames()).toHaveLength(1);
    expect(visibleRepositoryNames()[0]).toContain("partial");
  });

  it("should filter by visibility", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("open").build(),
      RepositoryBuilder.create().withName("closed").asPrivate().build(),
    ]);

    // when
    selectFilter("visibility", "PRIVATE");

    // then
    expect(visibleRepositoryNames()).toHaveLength(1);
    expect(visibleRepositoryNames()[0]).toContain("closed");
  });

  it("should filter by quality gate status", () => {
    // given
    const withGate = (name: string, status: "OK" | "ERROR") => {
      const repo = RepositoryBuilder.create().withName(name).build();
      return {
        ...repo,
        sonarMetrics: {
          bugs: 0,
          codeSmells: 0,
          securityHotspots: 0,
          vulnerabilities: 0,
          coverage: 50,
          duplications: 1,
          technicalDebt: "1h",
          qualityGateStatus: status,
        },
      };
    };
    renderTable([withGate("passing", "OK"), withGate("failing", "ERROR")]);

    // when
    selectFilter("qualityGate", "ERROR");

    // then
    expect(visibleRepositoryNames()).toHaveLength(1);
    expect(visibleRepositoryNames()[0]).toContain("failing");
  });

  it("should show every repository again when a select filter is cleared", () => {
    // given
    renderTable([
      RepositoryBuilder.create().withName("open").build(),
      RepositoryBuilder.create().withName("closed").asPrivate().build(),
    ]);
    selectFilter("visibility", "PRIVATE");

    // when
    selectFilter("visibility", "");

    // then
    expect(visibleRepositoryNames()).toHaveLength(2);
  });
});

describe("RepositoryTable relative dates", () => {
  it.each([
    [0, "today"],
    [1, "yesterday"],
    [5, "5d ago"],
    [70, "2mo ago"],
    [800, "2y ago"],
  ])("should render an update %s days old as %s", (days, expected) => {
    // given / when
    renderTable([
      RepositoryBuilder.create().withName("dated").withUpdatedAt(daysAgo(days)).build(),
    ]);

    // then
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe("RepositoryTable quality gate cell", () => {
  it("should show nothing when Sonar reports no quality gate", () => {
    // given / when
    renderTable([RepositoryBuilder.create().withName("unmeasured").build()]);

    // then
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });
});

describe("RepositoryTable pagination", () => {
  const manyRepos = () =>
    Array.from({ length: 30 }, (_, index) =>
      RepositoryBuilder.create().withName(`repo-${String(index).padStart(2, "0")}`).build(),
    );

  it("should show only the first page when there are more rows than the page size", () => {
    // given / when
    renderTable(manyRepos());

    // then
    expect(visibleRepositoryNames()).toHaveLength(25);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("should move to the next page and back again", () => {
    // given
    renderTable(manyRepos());

    // when
    fireEvent.click(screen.getByText("Next"));

    // then
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(visibleRepositoryNames()).toHaveLength(5);

    // when
    fireEvent.click(screen.getByText("Previous"));

    // then
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("should hide the pagination controls when everything fits on one page", () => {
    // given / when
    renderTable([RepositoryBuilder.create().withName("only").build()]);

    // then
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });
});
