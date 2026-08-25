import {
  buildApiExposure,
  computeApiExposureState,
  type ApiExposureEvidence,
} from "../src/api_exposure";

const evidence = (overrides: Partial<ApiExposureEvidence> = {}): ApiExposureEvidence => ({
  declaredApis: 0,
  definitionPath: null,
  entityType: null,
  isArchived: false,
  ...overrides,
});

describe("computeApiExposureState", () => {
  it("should report declared when the entity names an API", () => {
    // given
    const input = evidence({ declaredApis: 2 });

    // when
    const state = computeApiExposureState(input);

    // then
    expect(state).toBe("declared");
  });

  it("should report a candidate when a definition exists and nothing is declared", () => {
    // given
    const input = evidence({ definitionPath: "openapi.yaml" });

    // when
    const state = computeApiExposureState(input);

    // then
    // The definition is in the repository, so only the catalog wiring is
    // missing. This is the flag worth acting on.
    expect(state).toBe("candidate");
  });

  it("should prefer declared over candidate when both hold", () => {
    // given
    const input = evidence({ declaredApis: 1, definitionPath: "openapi.yaml" });

    // when
    const state = computeApiExposureState(input);

    // then
    expect(state).toBe("declared");
  });

  it("should report expected for a service with no definition file", () => {
    // given
    const input = evidence({ entityType: "Service" });

    // when
    const state = computeApiExposureState(input);

    // then
    // A weaker signal than a definition file, kept apart so a real finding is
    // never diluted by a guess. Matched case-insensitively, because `spec.type`
    // is free text.
    expect(state).toBe("expected");
  });

  it("should report none for a library", () => {
    // given
    const input = evidence({ entityType: "library" });

    // when
    const state = computeApiExposureState(input);

    // then
    expect(state).toBe("none");
  });

  it("should report none for an archived repository holding a definition", () => {
    // given
    const input = evidence({ isArchived: true, definitionPath: "openapi.yaml" });

    // when
    const state = computeApiExposureState(input);

    // then
    // An archived repository is not a backlog item.
    expect(state).toBe("none");
  });
});

describe("buildApiExposure", () => {
  it("should carry the evidence alongside the grade", () => {
    // given
    const input = evidence({ definitionPath: "api/openapi.yaml", entityType: "service" });

    // when
    const exposure = buildApiExposure(input);

    // then
    expect(exposure).toEqual({
      declaredApis: 0,
      definitionPath: "api/openapi.yaml",
      entityType: "service",
      state: "candidate",
    });
  });
});
