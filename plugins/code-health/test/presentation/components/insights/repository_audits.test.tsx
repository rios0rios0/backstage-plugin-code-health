import Grid from "@material-ui/core/Grid";
import type { RepositorySummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RepositoryAudits } from "../../../../src/presentation/components/insights/repository_audits";
import { RepositoryBuilder } from "../../../builders/repository_builder";

/**
 * The card emits loose `Grid item` children so it can drop into the page's own
 * grid, so the test supplies the container the page would. The gap lists link
 * their rows to catalog entities, which is where the annotation that closes a
 * gap gets written, so a router has to be there too.
 */
const renderCards = (repositories: readonly RepositorySummary[]) =>
  render(
    <MemoryRouter>
      <Grid container>
        <RepositoryAudits repositories={repositories} />
      </Grid>
    </MemoryRouter>,
  );

describe("RepositoryAudits", () => {
  it("should name the repositories whose documentation was never published", () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withName("gateway")
        .withDocumentationState("unpublished", { hasDocsSource: true })
        .build(),
    ];

    // when
    renderCards(repositories);

    // then
    expect(screen.getByText("Written but not published")).toBeInTheDocument();
    expect(screen.getByText("has a docs/ tree")).toBeInTheDocument();
  });

  it("should keep undocumented repositories apart from unpublished ones", () => {
    // given
    // The two cost completely different amounts to fix: one is an annotation,
    // the other is somebody sitting down to write.
    const repositories = [
      RepositoryBuilder.create()
        .withName("silent")
        .withDocumentationState("missing", { hasReadme: true })
        .build(),
    ];

    // when
    renderCards(repositories);

    // then
    expect(screen.getByText("No documentation at all")).toBeInTheDocument();
    expect(screen.getByText("README only")).toBeInTheDocument();
    expect(
      screen.getByText("Every repository that writes documentation publishes it."),
    ).toBeInTheDocument();
  });

  it("should flag the repositories that could be catalog APIs and are not", () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withName("gateway")
        .withApiExposureState("candidate", "api/openapi.yaml")
        .build(),
    ];

    // when
    renderCards(repositories);

    // then
    expect(screen.getByText("Catalog APIs")).toBeInTheDocument();
    expect(screen.getByText("api/openapi.yaml")).toBeInTheDocument();
  });

  it("should report the fleet's quality gates and its branch policy side by side", () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withName("gateway")
        .withQualityGate("ERROR")
        .withComplianceColor("green")
        .build(),
      RepositoryBuilder.create().withName("unmeasured").build(),
    ];

    // when
    renderCards(repositories);

    // then
    expect(screen.getByText("Fleet health")).toBeInTheDocument();
    expect(screen.getByLabelText("Failing: 1 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Compliant: 1 of 2")).toBeInTheDocument();
    // "Not measured" is counted apart from a failure: the two call for
    // different actions, and merging them overstates the problem. Both
    // breakdowns carry their own residual, which is why there are two rows.
    expect(screen.getAllByLabelText("Not measured: 1 of 2")).toHaveLength(2);
  });

  it("should say so when no gap is left on any of the three", () => {
    // given
    const repositories = [
      RepositoryBuilder.create()
        .withName("gateway")
        .withDocumentationState("documented")
        .withApiExposureState("declared")
        .build(),
    ];

    // when
    renderCards(repositories);

    // then
    expect(
      screen.getByText("Every repository that writes documentation publishes it."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing in the fleet is completely undocumented."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every repository that looks like it serves an API already declares one.",
      ),
    ).toBeInTheDocument();
  });
});
