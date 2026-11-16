import {
  buildApiExposure,
  computeApiExposureState,
  type ApiExposureEvidence,
} from "../src/api_exposure";

const evidence = (overrides: Partial<ApiExposureEvidence> = {}): ApiExposureEvidence => ({
  declaredApis: 0,
  declaresNoApi: false,
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

describe("computeApiExposureState with the owner's declaration", () => {
  it("should report none for a definition the entity declares it does not serve", () => {
    // given
    const input = evidence({ declaresNoApi: true, definitionPath: "openapi.yaml" });

    // when
    const state = computeApiExposureState(input);

    // then
    // A definition file can be a vendor's, kept to build a client from, so the
    // owner's word outranks what the file scan found.
    expect(state).toBe("none");
  });

  it("should report none for a service that declares it exposes no API of its own", () => {
    // given
    const input = evidence({ declaresNoApi: true, entityType: "service" });

    // when
    const state = computeApiExposureState(input);

    // then
    // A component running third-party software serves that vendor's API, which
    // `spec.type` alone cannot tell apart from one its team defines.
    expect(state).toBe("none");
  });

  it("should still report declared when the entity names an API as well", () => {
    // given
    const input = evidence({ declaresNoApi: true, declaredApis: 1 });

    // when
    const state = computeApiExposureState(input);

    // then
    // The catalog holds the API whatever the annotation beside it says.
    expect(state).toBe("declared");
  });

  it("should keep an archived repository at none", () => {
    // given
    const input = evidence({
      declaresNoApi: true,
      isArchived: true,
      definitionPath: "openapi.yaml",
    });

    // when
    const state = computeApiExposureState(input);

    // then
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
      declaresNoApi: false,
      definitionPath: "api/openapi.yaml",
      entityType: "service",
      state: "candidate",
    });
  });

  it("should carry the declaration beside the none it decided", () => {
    // given
    const input = evidence({ declaresNoApi: true, entityType: "service" });

    // when
    const exposure = buildApiExposure(input);

    // then
    // Without the flag a reader could not tell this `none` from one nothing
    // pointed at.
    expect(exposure).toMatchObject({ declaresNoApi: true, state: "none" });
  });
});

describe("buildApiExposure with evidence written before the declaration existed", () => {
  it("should read a missing declaration as false when the caller predates the field", () => {
    // given
    const input: ApiExposureEvidence = {
      declaredApis: 0,
      definitionPath: "openapi.yaml",
      entityType: "service",
      isArchived: false,
    };

    // when
    const exposure = buildApiExposure(input);

    // then
    // The field is optional on the evidence so older callers compile unchanged,
    // and leaving it out must not silence a real finding.
    expect(exposure.declaresNoApi).toBe(false);
    expect(exposure.state).toBe("candidate");
  });
});
