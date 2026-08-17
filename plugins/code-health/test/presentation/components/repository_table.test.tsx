import { render as renderBare, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RepositoryTable } from "../../../src/presentation/components/repository_table";
import { RepositoryBuilder } from "../../builders/repository_builder";

// The repository name links to the catalog entity through a router `Link`, so the
// component only mounts inside a router — which is how the app renders it.
const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

describe("RepositoryTable", () => {
  it("should link the repository name to its catalog entity", async () => {
    // given
    // The provider URL is deliberately not the destination: the catalog entity is
    // where the owner, docs and other tabs live, and it carries the provider URL.
    const repos = [
      RepositoryBuilder.create()
        .withFullName("user/my-repo")
        .withEntityRef("component:default/my-repo")
        .withUrl("https://dev.azure.com/org/project/_git/my-repo")
        .build(),
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    const link = screen.getByText("user/my-repo").closest("a");
    expect(link).toHaveAttribute("href", "/catalog/default/component/my-repo");
  });

  it("should render the name as plain text when the entity reference is unusable", async () => {
    // given
    // A malformed reference should cost this one row its link, not throw and take
    // the whole table down with it.
    const repos = [
      RepositoryBuilder.create().withFullName("user/broken").withEntityRef("not-a-ref").build(),
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("user/broken")).toBeInTheDocument();
    expect(screen.getByText("user/broken").closest("a")).toBeNull();
  });

  it("should render 'No repositories found.' when repositories is empty and not loading", () => {
    // given / when
    render(<RepositoryTable repositories={[]} totalCount={0} isLoading={false} />);

    // then
    expect(screen.getByText("No repositories found.")).toBeInTheDocument();
  });

  it("should render loading skeleton when isLoading is true", () => {
    // given / when
    const { container } = render(
      <RepositoryTable repositories={[]} totalCount={0} isLoading />,
    );

    // then
    const skeletonRows = container.querySelectorAll("[data-testid=\"loadingRow\"]");
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it("should render repository rows with name, CI status, and language", () => {
    // given
    const repos = [
      RepositoryBuilder.create()
        .withName("my-repo")
        .withLanguage("TypeScript")
        .withCiStatus("SUCCESS")
        .build(),
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("user/my-repo")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("should render archived badge for archived repos", () => {
    // given
    const repos = [RepositoryBuilder.create().withName("old-repo").asArchived().build()];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then - archived repos are hidden by default, need to check the checkbox
    fireEvent.click(screen.getByLabelText("Archived"));
    expect(screen.getByText("archived")).toBeInTheDocument();
  });

  it("should render fork badge for forked repos", () => {
    // given
    const repos = [RepositoryBuilder.create().withName("fork-repo").asFork().build()];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then - forks are hidden by default
    fireEvent.click(screen.getByLabelText("Forks"));
    expect(screen.getByText("fork")).toBeInTheDocument();
  });

  it("should show repository count", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("repo-1").build(),
      RepositoryBuilder.create().withName("repo-2").build(),
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={5} isLoading={false} />);

    // then
    expect(screen.getByText(/2 of 5 repositories/)).toBeInTheDocument();
  });

  it("should filter archived repos by default (showArchived off)", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("active").build(),
      RepositoryBuilder.create().withName("old").asArchived().build(),
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={2} isLoading={false} />);

    // then
    expect(screen.getByText("user/active")).toBeInTheDocument();
    expect(screen.queryByText("user/old")).not.toBeInTheDocument();
  });

  it("should show archived repos when checkbox is checked", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("active").build(),
      RepositoryBuilder.create().withName("old").asArchived().build(),
    ];
    render(<RepositoryTable repositories={repos} totalCount={2} isLoading={false} />);

    // when
    fireEvent.click(screen.getByLabelText("Archived"));

    // then
    expect(screen.getByText("user/old")).toBeInTheDocument();
  });

  it("should show fork repos when checkbox is checked", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("mine").build(),
      RepositoryBuilder.create().withName("forked").asFork().build(),
    ];
    render(<RepositoryTable repositories={repos} totalCount={2} isLoading={false} />);

    // when
    fireEvent.click(screen.getByLabelText("Forks"));

    // then
    expect(screen.getByText("user/forked")).toBeInTheDocument();
  });

  it("should render release tag and relative date", () => {
    // given
    const repos = [
      RepositoryBuilder.create()
        .withName("released")
        .withLatestRelease({
          tagName: "v2.0.0",
          publishedAt: new Date().toISOString(),
        })
        .build(),
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    expect(screen.getByText("today")).toBeInTheDocument();
  });

  it("should render 'private' badge for private repos", () => {
    // given
    const repos = [RepositoryBuilder.create().withName("secret").asPrivate().build()];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it("should render Sonar quality gate Passed status", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("sonar-ok").build(),
        sonarMetrics: {
          bugs: 0,
          codeSmells: 0,
          securityHotspots: 0,
          vulnerabilities: 0,
          coverage: 90,
          duplications: 1,
          technicalDebt: "0min",
          technicalDebtMinutes: 0,
          qualityGateStatus: "OK" as const,
        },
      },
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("Passed")).toBeInTheDocument();
  });

  it("should highlight a default branch that is not 'main'", () => {
    // given
    const repos = [
      { ...RepositoryBuilder.create().withName("legacy").build(), defaultBranch: "master" },
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    const branch = screen.getByText("master");
    expect(branch.closest("[title]")?.getAttribute("title")).toBe("Default branch is not 'main'");
  });

  it("should count the branches other than the default one", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("many-branches").build(),
        branches: ["main", "feat/a", "fix/b"],
      },
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("should list the non-default branches when the count is clicked", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("many-branches").build(),
        branches: ["main", "feat/a", "fix/b"],
      },
    ];
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // when
    fireEvent.click(screen.getByText("2"));

    // then
    const menu = within(screen.getByRole("menu", { name: "Branches" }));
    expect(menu.getByText("feat/a")).toBeInTheDocument();
    expect(menu.getByText("fix/b")).toBeInTheDocument();
    expect(menu.queryByText("main")).not.toBeInTheDocument();
  });

  it("should close the branches popup when the overlay is clicked", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("many-branches").build(),
        branches: ["main", "feat/a"],
      },
    ];
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);
    fireEvent.click(screen.getByText("1"));

    // when
    fireEvent.click(screen.getByTestId("branches-overlay"));

    // then
    expect(screen.queryByText("feat/a")).not.toBeInTheDocument();
  });

  it("should tell the user when a repository has no extra branches", () => {
    // given
    const repos = [
      { ...RepositoryBuilder.create().withName("solo").build(), branches: ["main"] },
    ];
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // when
    fireEvent.click(screen.getByText("0"));

    // then
    expect(screen.getByText("No extra branches")).toBeInTheDocument();
  });

  it("should render the compliance badge when compliance data is available", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("compliant").build(),
        complianceStatus: {
          pipelineExists: true,
          buildPolicyOnPRs: true,
          buildPolicyExpiration: true,
          branchProtection: true,
          color: "green" as const,
        },
      },
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("Compliant")).toBeInTheDocument();
  });

  it("should render the badge status cell when badge data is available", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("badged").build(),
        badgeStatus: {
          checks: [{ label: "License", present: true }],
          color: "green" as const,
        },
      },
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("should filter rows through a column filter", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("alpha").build(),
      RepositoryBuilder.create().withName("beta").build(),
    ];
    render(<RepositoryTable repositories={repos} totalCount={2} isLoading={false} />);

    // when
    fireEvent.change(screen.getByLabelText("Filter fullName"), { target: { value: "alpha" } });

    // then
    expect(screen.getByText("user/alpha")).toBeInTheDocument();
    expect(screen.queryByText("user/beta")).not.toBeInTheDocument();
  });

  it("should filter rows through a select column filter", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("public-repo").build(),
      RepositoryBuilder.create().withName("secret").asPrivate().build(),
    ];
    render(<RepositoryTable repositories={repos} totalCount={2} isLoading={false} />);

    // when
    fireEvent.change(screen.getByLabelText("Filter visibility"), { target: { value: "PRIVATE" } });

    // then
    expect(screen.getByText("user/secret")).toBeInTheDocument();
    expect(screen.queryByText("user/public-repo")).not.toBeInTheDocument();
  });

  it("should sort rows when a column header is clicked", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("alpha").build(),
      RepositoryBuilder.create().withName("beta").build(),
    ];
    render(<RepositoryTable repositories={repos} totalCount={2} isLoading={false} />);

    // when
    fireEvent.click(screen.getByText("Repository"));

    // then
    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["user/beta", "user/alpha"]);
  });

  it("should render Sonar quality gate Failed status", () => {
    // given
    const repos = [
      {
        ...RepositoryBuilder.create().withName("sonar-fail").build(),
        sonarMetrics: {
          bugs: 5,
          codeSmells: 10,
          securityHotspots: 1,
          vulnerabilities: 2,
          coverage: 20,
          duplications: 15,
          technicalDebt: "5d",
          technicalDebtMinutes: 2400,
          qualityGateStatus: "ERROR" as const,
        },
      },
    ];

    // when
    render(<RepositoryTable repositories={repos} totalCount={1} isLoading={false} />);

    // then
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
