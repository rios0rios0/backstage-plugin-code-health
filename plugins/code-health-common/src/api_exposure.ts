/**
 * Whether a repository's API is described in the catalog.
 *
 * Backstage models an API as its own entity, which a component claims through
 * `spec.providesApis`. A service that exposes an interface and declares none is
 * invisible to everything the catalog builds on top of that relation — the API
 * explorer, dependency graphs, the "who calls this" question — so the gap is
 * worth naming rather than leaving to whoever remembers.
 *
 * - `declared` — the entity names at least one API.
 * - `candidate` — the repository ships an API definition (an OpenAPI, AsyncAPI,
 *   GraphQL or protobuf file) and the entity names none. This is the flag: the
 *   evidence is in the repository, so the definition exists and only the catalog
 *   wiring is absent.
 * - `expected` — no definition file was found, but the entity is typed as
 *   something that serves traffic. A weaker signal, kept apart from `candidate`
 *   so a real finding is never diluted by a guess.
 * - `none` — nothing suggests this repository exposes an API, or its owner
 *   declared that it exposes none of its own with the
 *   `code-health/api-exposure: none` annotation.
 *
 * The declaration outranks both `candidate` and `expected`, because those two
 * are inferences and it is the word of whoever owns the component. A
 * component that runs third-party software serves that vendor's API rather
 * than one its team defines, and may keep the vendor's definition file in the
 * repository besides, yet a `service` with no `spec.providesApis` would
 * otherwise be graded as missing one for as long as it exists. It does not
 * outrank `declared`: an entity that names an API in `spec.providesApis` has
 * one in the catalog, whatever an annotation beside it says.
 */
export type ApiExposureState = "declared" | "candidate" | "expected" | "none";

export interface ApiExposure {
  /** How many APIs `spec.providesApis` names. */
  readonly declaredApis: number;
  /**
   * The entity carries `code-health/api-exposure: none`. Kept beside the state
   * so a reader can tell a `none` the owner declared from one that nothing
   * pointed at.
   */
  readonly declaresNoApi: boolean;
  /** Repository-relative path of the definition that was found, if any. */
  readonly definitionPath: string | null;
  /** `spec.type` of the catalog entity, e.g. `service`. */
  readonly entityType: string | null;
  readonly state: ApiExposureState;
}

/**
 * Component types that serve traffic, and so are expected to describe what they
 * serve. Matched case-insensitively, because `spec.type` is free text and the
 * same idea is spelled several ways across organisations.
 */
export const API_SERVING_TYPES: readonly string[] = [
  "service",
  "api",
  "backend",
  "microservice",
  "grpc-service",
  "rest-service",
  "openapi",
];

export interface ApiExposureEvidence {
  readonly declaredApis: number;
  /**
   * The entity carries `code-health/api-exposure: none`. Optional so a caller
   * written before the annotation existed compiles unchanged; absent reads as
   * `false`.
   */
  readonly declaresNoApi?: boolean;
  readonly definitionPath: string | null;
  readonly entityType: string | null;
  readonly isArchived: boolean;
}

export const computeApiExposureState = (
  evidence: ApiExposureEvidence,
): ApiExposureState => {
  if (evidence.declaredApis > 0) return "declared";
  // Archived repositories are not a backlog item. They are reported as `none`
  // rather than as a gap somebody is expected to close.
  if (evidence.isArchived) return "none";
  // The owner's word outranks both inferences below: a definition file can be
  // a vendor's, kept to build a client from, and `spec.type` says what a
  // component is rather than whose API it serves.
  if (evidence.declaresNoApi === true) return "none";
  if (evidence.definitionPath !== null) return "candidate";
  const type = evidence.entityType?.toLowerCase() ?? null;
  return type !== null && API_SERVING_TYPES.includes(type) ? "expected" : "none";
};

export const buildApiExposure = (evidence: ApiExposureEvidence): ApiExposure => ({
  declaredApis: evidence.declaredApis,
  declaresNoApi: evidence.declaresNoApi ?? false,
  definitionPath: evidence.definitionPath,
  entityType: evidence.entityType,
  state: computeApiExposureState(evidence),
});
