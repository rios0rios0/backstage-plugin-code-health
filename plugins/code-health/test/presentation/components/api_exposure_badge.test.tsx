import type { ApiExposure } from "@rios0rios0/backstage-plugin-code-health-common";
import { render, screen } from "@testing-library/react";
import { ApiExposureBadge } from "../../../src/presentation/components/api_exposure_badge";

const exposure = (overrides: Partial<ApiExposure> = {}): ApiExposure => ({
  declaredApis: 0,
  definitionPath: null,
  entityType: null,
  state: "none",
  ...overrides,
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
