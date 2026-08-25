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
 * - `none` — nothing suggests this repository exposes an API.
 */
export type ApiExposureState = "declared" | "candidate" | "expected" | "none";

export interface ApiExposure {
  /** How many APIs `spec.providesApis` names. */
  readonly declaredApis: number;
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
  if (evidence.definitionPath !== null) return "candidate";
  const type = evidence.entityType?.toLowerCase() ?? null;
  return type !== null && API_SERVING_TYPES.includes(type) ? "expected" : "none";
};

export const buildApiExposure = (evidence: ApiExposureEvidence): ApiExposure => ({
  declaredApis: evidence.declaredApis,
  definitionPath: evidence.definitionPath,
  entityType: evidence.entityType,
  state: computeApiExposureState(evidence),
});
