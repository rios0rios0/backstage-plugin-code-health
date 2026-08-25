import {
  buildDocumentationStatus,
  computeDocumentationState,
  type DocumentationEvidence,
} from "../src/documentation_status";

const evidence = (overrides: Partial<DocumentationEvidence> = {}): DocumentationEvidence => ({
  hasTechDocs: false,
  hasDocsSource: false,
  hasReadme: false,
  hasExternalDocs: false,
  isArchived: false,
  ...overrides,
});

describe("computeDocumentationState", () => {
  it("should report documented when TechDocs is wired up", () => {
    // given
    const input = evidence({ hasTechDocs: true });

    // when
    const state = computeDocumentationState(input);

    // then
    expect(state).toBe("documented");
  });

  it("should report unpublished when the repository writes docs nobody published", () => {
    // given
    const input = evidence({ hasDocsSource: true });

    // when
    const state = computeDocumentationState(input);

    // then
    // The whole point of the grade: the documentation exists, so closing the
    // gap is one annotation rather than a writing project.
    expect(state).toBe("unpublished");
  });

  it("should report unpublished when the entity only links out to docs", () => {
    // given
    const input = evidence({ hasExternalDocs: true });

    // when
    const state = computeDocumentationState(input);

    // then
    expect(state).toBe("unpublished");
  });

  it("should report missing when a README is all there is", () => {
    // given
    const input = evidence({ hasReadme: true });

    // when
    const state = computeDocumentationState(input);

    // then
    // Nearly every repository has a README. Counting it would grade the whole
    // fleet documented and the metric would measure nothing.
    expect(state).toBe("missing");
  });

  it("should report not-expected for an archived repository", () => {
    // given
    const input = evidence({ isArchived: true });

    // when
    const state = computeDocumentationState(input);

    // then
    expect(state).toBe("not-expected");
  });

  it("should prefer not-expected over documented for an archived repository", () => {
    // given
    const input = evidence({ isArchived: true, hasTechDocs: true });

    // when
    const state = computeDocumentationState(input);

    // then
    // Nobody is being asked to act on an archived repository either way, so it
    // stays out of both the numerator and the denominator.
    expect(state).toBe("not-expected");
  });
});

describe("buildDocumentationStatus", () => {
  it("should carry every check alongside the grade", () => {
    // given
    const input = evidence({ hasReadme: true, hasDocsSource: true });

    // when
    const status = buildDocumentationStatus(input);

    // then
    expect(status).toEqual({
      hasTechDocs: false,
      hasDocsSource: true,
      hasReadme: true,
      hasExternalDocs: false,
      state: "unpublished",
    });
  });
});
