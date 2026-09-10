import { renderInTestApp } from "@backstage/test-utils";
import type { OwnershipInfo } from "@rios0rios0/backstage-plugin-code-health-common";
import { screen, within } from "@testing-library/react";
import { OwnedRepositoriesCard } from "../../../src/presentation/components/owned_repositories_card";
import { rootRouteRef } from "../../../src/routes";
import { RepositoryBuilder } from "../../builders/repository_builder";

const LINKED: OwnershipInfo = {
  entityRef: "user:default/jane",
  owners: ["user:default/jane", "group:default/platform"],
};

const UNLINKED: OwnershipInfo = { entityRef: null, owners: [] };

/** A repository failing everything a snapshot can measure. */
const unhealthy = RepositoryBuilder.create()
  .withName("legacy-gateway")
  .withCoverage(4, "ERROR")
  .withCiStatus("FAILURE")
  .withComplianceColor("red")
  .withDocumentationState("missing")
  .build();

/** One passing everything, so the sort has two ends to put in order. */
const healthy = RepositoryBuilder.create()
  .withName("billing")
  .withCoverage(94, "OK")
  .withCiStatus("SUCCESS")
  .withComplianceColor("green")
  .withDocumentationState("documented")
  .build();

/** Two nothing has measured yet: unknown health, not bad health. */
const unmeasured = RepositoryBuilder.create().withName("brand-new").build();
const alsoUnmeasured = RepositoryBuilder.create().withName("just-added").build();

const renderCard = (
  props: Partial<React.ComponentProps<typeof OwnedRepositoriesCard>> = {},
) =>
  renderInTestApp(
    <OwnedRepositoriesCard
      ownership={LINKED}
      repositories={[]}
      isLoading={false}
      error={null}
      {...props}
    />,
    { mountedRoutes: { "/": rootRouteRef } },
  );

describe("OwnedRepositoriesCard", () => {
  it("should list the worst repository first, with the unmeasured after it", async () => {
    // given
    // The reason to open somebody's page is to find what needs attention, and a
    // list that leads with the healthiest buries it. A repository nothing has
    // measured is a different problem, not the worst one.
    await renderCard({
      repositories: [healthy, unmeasured, unhealthy, alsoUnmeasured],
    });

    // when
    const rows = screen.getAllByRole("row").slice(1);

    // then
    // Two unmeasured rows tie rather than fighting, so they keep the order the
    // backend sent them in.
    expect(
      rows.map((row) => within(row).getAllByRole("cell")[0].textContent),
    ).toEqual(["legacy-gateway", "billing", "brand-new", "just-added"]);
  });

  it("should link each repository to its own page", async () => {
    // given / when
    await renderCard({ repositories: [healthy] });

    // then
    expect(screen.getByRole("link", { name: "billing" })).toHaveAttribute(
      "href",
      `/repositories/${healthy.id}`,
    );
  });

  it("should band the health score and show the workings behind it", async () => {
    // given
    // A bare score is a number nobody can act on; the components say which
    // figure pulled it down.
    await renderCard({ repositories: [unhealthy] });

    // when
    const score = screen.getByLabelText(/^Health \d+ out of 100/u);

    // then
    expect(score).toHaveAttribute("data-band", "poor");
    expect(score.closest("[title]")?.getAttribute("title")).toContain("Quality gate");
  });

  it("should show a dash rather than a zero for a repository nothing has measured", async () => {
    // given
    // Grading an unmeasured repository zero would report a failure nobody found.
    await renderCard({ repositories: [unmeasured] });

    // then
    expect(screen.getByLabelText("Health — out of 100, Not measured")).toBeInTheDocument();
  });

  it("should carry the badges the repositories table uses", async () => {
    // given / when
    await renderCard({ repositories: [healthy] });

    // then
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Passing")).toBeInTheDocument();
    expect(screen.getByText("Compliant")).toBeInTheDocument();
    expect(screen.getByText("TechDocs")).toBeInTheDocument();
    expect(screen.getByText("94.0%")).toBeInTheDocument();
  });

  it("should point an unlinked account at the Identities tab", async () => {
    // given
    // An account nobody has linked has no catalog entity, so there is nobody
    // for a repository to name as its owner — a different problem from owning
    // nothing.
    await renderCard({ ownership: UNLINKED });

    // then
    expect(screen.getByText(/not linked to a catalog user/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Identities tab" })).toHaveAttribute(
      "href",
      "/identities",
    );
  });

  it("should say what a linked person was matched against when they own nothing", async () => {
    // given
    // Ownership is matched against their user and every group they belong to,
    // and naming those is what turns "owns nothing" into something checkable.
    await renderCard({ ownership: LINKED, repositories: [] });

    // then
    expect(screen.getByText(/No catalog entity names/u)).toBeInTheDocument();
    expect(
      screen.getByText("Matched against: user:default/jane, group:default/platform."),
    ).toBeInTheDocument();
  });

  it("should not invent a match list for a person whose groups nobody resolved", async () => {
    // given
    // The catalog answered with the person and no groups at all, which is a
    // sentence with nothing to append to it.
    await renderCard({ ownership: { entityRef: "user:default/jane", owners: [] } });

    // then
    expect(screen.getByText(/No catalog entity names/u)).toBeInTheDocument();
    expect(screen.queryByText(/Matched against/u)).not.toBeInTheDocument();
  });

  it("should show progress until the first answer lands", async () => {
    // given / when
    await renderCard({ ownership: null, isLoading: true });

    // then
    expect(screen.getByTestId("progress")).toBeInTheDocument();
  });

  it("should report a failure rather than an empty list", async () => {
    // given
    // "Nobody owns anything" and "the request failed" are different sentences.
    await renderCard({ ownership: null, error: "catalog is down" });

    // then
    expect(
      screen.getByText(/Failed to load the owned repositories/u),
    ).toBeInTheDocument();
  });

  it("should render nothing while it has neither an answer nor a request in flight", async () => {
    // given
    // The page mounts the card before the key is known to the hook.
    await renderCard({ ownership: null, isLoading: false });

    // then
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress")).not.toBeInTheDocument();
  });
});
