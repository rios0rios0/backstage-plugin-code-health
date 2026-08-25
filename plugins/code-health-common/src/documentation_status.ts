/**
 * Where a repository stands on documentation.
 *
 * `documented` means TechDocs is wired up — the catalog entity carries
 * `backstage.io/techdocs-ref`, so a reader inside Backstage can actually open
 * the documentation. Everything else is a gap of some kind, and the three that
 * follow are kept apart because they call for different work:
 *
 * - `unpublished` is a repository that already writes documentation (a `docs/`
 *   tree, an `mkdocs.yml`, an external documentation link) and has simply never
 *   been pointed at TechDocs. This is the "would likely have it but does not"
 *   case, and it is the cheapest one to close — one annotation.
 * - `missing` is a repository with nothing at all.
 * - `not-expected` is an archived repository, which nobody should be asked to
 *   document.
 */
export type DocumentationState =
  | "documented"
  | "unpublished"
  | "missing"
  | "not-expected";

export interface DocumentationStatus {
  /** The entity carries `backstage.io/techdocs-ref`. */
  readonly hasTechDocs: boolean;
  /** A `docs/` tree or an `mkdocs.yml` exists in the repository. */
  readonly hasDocsSource: boolean;
  /** A README exists at the repository root. */
  readonly hasReadme: boolean;
  /** The entity links out to documentation hosted somewhere else. */
  readonly hasExternalDocs: boolean;
  readonly state: DocumentationState;
}

export interface DocumentationEvidence {
  readonly hasTechDocs: boolean;
  readonly hasDocsSource: boolean;
  readonly hasReadme: boolean;
  readonly hasExternalDocs: boolean;
  readonly isArchived: boolean;
}

/**
 * Grades the evidence.
 *
 * A README on its own deliberately does not count as documentation. Practically
 * every repository has one, so treating it as a pass would grade the whole fleet
 * `documented` and the metric would say nothing. It is still reported as a
 * check, because "has a README and nothing else" and "has nothing at all" are
 * different conversations to have with a team.
 */
export const computeDocumentationState = (
  evidence: DocumentationEvidence,
): DocumentationState => {
  if (evidence.isArchived) return "not-expected";
  if (evidence.hasTechDocs) return "documented";
  if (evidence.hasDocsSource || evidence.hasExternalDocs) return "unpublished";
  return "missing";
};

export const buildDocumentationStatus = (
  evidence: DocumentationEvidence,
): DocumentationStatus => ({
  hasTechDocs: evidence.hasTechDocs,
  hasDocsSource: evidence.hasDocsSource,
  hasReadme: evidence.hasReadme,
  hasExternalDocs: evidence.hasExternalDocs,
  state: computeDocumentationState(evidence),
});
