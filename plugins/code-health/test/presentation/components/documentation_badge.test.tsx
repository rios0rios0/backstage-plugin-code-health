import type {
  ApiExposure,
  DocumentationStatus,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { render, screen } from "@testing-library/react";
import {
  ApiExposureBadge,
  DocumentationBadge,
} from "../../../src/presentation/components/documentation_badge";

const documentation = (
  overrides: Partial<DocumentationStatus> = {},
): DocumentationStatus => ({
  hasTechDocs: false,
  hasDocsSource: false,
  hasReadme: false,
  hasExternalDocs: false,
  state: "missing",
  ...overrides,
});

const exposure = (overrides: Partial<ApiExposure> = {}): ApiExposure => ({
  declaredApis: 0,
  definitionPath: null,
  entityType: null,
  state: "none",
  ...overrides,
});

describe("DocumentationBadge", () => {
  it("should render nothing measurable as an empty cell", () => {
    // given / when
    const { container } = render(<DocumentationBadge status={null} />);

    // then
    // Null is "not measured yet", not "nothing found", and the two must not
    // look the same on a row.
    expect(container.textContent).not.toContain("None");
  });

  it("should label a published repository", () => {
    // given / when
    render(
      <DocumentationBadge status={documentation({ hasTechDocs: true, state: "documented" })} />,
    );

    // then
    expect(screen.getByText("TechDocs")).toBeInTheDocument();
  });

  it("should label a repository whose docs were never published", () => {
    // given / when
    render(
      <DocumentationBadge
        status={documentation({ hasDocsSource: true, state: "unpublished" })}
      />,
    );

    // then
    expect(screen.getByText("Unpublished")).toBeInTheDocument();
  });

  it("should label an undocumented repository", () => {
    // given / when
    render(<DocumentationBadge status={documentation()} />);

    // then
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("should label an archived repository as exempt", () => {
    // given / when
    render(<DocumentationBadge status={documentation({ state: "not-expected" })} />);

    // then
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("should carry every check in its tooltip", () => {
    // given / when
    render(
      <DocumentationBadge
        status={documentation({ hasReadme: true, hasDocsSource: true, state: "unpublished" })}
      />,
    );

    // then
    // A reader has to be able to see why a repository landed where it did
    // without going to look at the entity.
    const chip = screen.getByText("Unpublished").closest("[title]");
    expect(chip?.getAttribute("title")).toContain("✓ Docs in the repository");
    expect(chip?.getAttribute("title")).toContain("✗ TechDocs annotation");
  });
});

describe("ApiExposureBadge", () => {
  it("should render nothing measurable as an empty cell", () => {
    // given / when
    const { container } = render(<ApiExposureBadge exposure={null} />);

    // then
    expect(container.textContent).not.toContain("Declared");
  });

  it("should label a repository that declares an API", () => {
    // given / when
    render(<ApiExposureBadge exposure={exposure({ declaredApis: 1, state: "declared" })} />);

    // then
    expect(screen.getByText("Declared")).toBeInTheDocument();
  });

  it("should label a repository shipping a definition it never declared", () => {
    // given / when
    render(
      <ApiExposureBadge
        exposure={exposure({ definitionPath: "openapi.yaml", state: "candidate" })}
      />,
    );

    // then
    expect(screen.getByText("Undeclared")).toBeInTheDocument();
  });

  it("should name the definition it found in the tooltip", () => {
    // given / when
    render(
      <ApiExposureBadge
        exposure={exposure({ definitionPath: "api/openapi.yaml", state: "candidate" })}
      />,
    );

    // then
    const chip = screen.getByText("Undeclared").closest("[title]");
    expect(chip?.getAttribute("title")).toContain("Found: api/openapi.yaml");
  });

  it("should label a service with no definition as the weaker signal", () => {
    // given / when
    render(<ApiExposureBadge exposure={exposure({ entityType: "service", state: "expected" })} />);

    // then
    // Kept apart from a real finding so an inference from `spec.type` never
    // dilutes evidence found in the repository.
    expect(screen.getByText("Likely")).toBeInTheDocument();
  });

  it("should label a repository with no API at all", () => {
    // given / when
    render(<ApiExposureBadge exposure={exposure()} />);

    // then
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});
