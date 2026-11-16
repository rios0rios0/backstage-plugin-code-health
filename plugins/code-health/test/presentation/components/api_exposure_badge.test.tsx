import type { ApiExposure } from "@rios0rios0/backstage-plugin-code-health-common";
import { render, screen } from "@testing-library/react";
import { ApiExposureBadge } from "../../../src/presentation/components/api_exposure_badge";

const exposure = (overrides: Partial<ApiExposure> = {}): ApiExposure => ({
  declaredApis: 0,
  declaresNoApi: false,
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

  it("should say in the tooltip that the entity declares no API of its own", () => {
    // given / when
    render(<ApiExposureBadge exposure={exposure({ declaresNoApi: true })} />);

    // then
    // The same chip as any other `None`, so the filter is unchanged; only the
    // reason says the owner made the call rather than the scan.
    const chip = screen.getByText("None").closest("[title]");
    expect(chip?.getAttribute("title")).toBe(
      "The catalog entity declares it exposes no API of its own (`code-health/api-exposure`).",
    );
  });

  it("should keep the declared tooltip when the entity names an API as well", () => {
    // given / when
    render(
      <ApiExposureBadge
        exposure={exposure({ declaredApis: 1, declaresNoApi: true, state: "declared" })}
      />,
    );

    // then
    const chip = screen.getByText("Declared").closest("[title]");
    expect(chip?.getAttribute("title")).toContain("spec.providesApis");
  });
});
