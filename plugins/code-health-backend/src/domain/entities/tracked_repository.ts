import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * What the catalog entry says about the repository, as opposed to what the
 * provider says about the repository itself.
 *
 * Read once per discovery pass and stored on the row, because it changes when
 * somebody edits a YAML file rather than on the snapshot's daily schedule, and
 * because re-reading it per dashboard load would put a catalog query back on
 * the request path this design exists to keep clear.
 */
export interface RepositoryCatalogFacts {
  /** `Component`, `System`, and so on. */
  readonly entityKind: string;
  /** `spec.type`, e.g. `service`. Null when the entity declares none. */
  readonly entityType: string | null;
  /** `backstage.io/techdocs-ref`, when the entity carries one. */
  readonly techDocsRef: string | null;
  /** How many entries `spec.providesApis` names. */
  readonly providesApis: number;
  /** The entity links out to documentation hosted somewhere else. */
  readonly hasExternalDocs: boolean;
  /**
   * Where the optional integrations should look for this repository's work.
   *
   * Each is an annotation and each is null when the entity carries none, which
   * is the only honest default: guessing a Jira project from a repository name
   * would attribute one team's tickets to another team's repository, and the
   * mistake would be invisible on a dashboard that shows only the total.
   */
  readonly jiraProjectKey: string | null;
  readonly jiraComponent: string | null;
  readonly confluenceSpaceKey: string | null;
  /**
   * The WakaTime project this repository is tracked as, when the entity names
   * one. Absent, the repository name is matched case-insensitively, which is
   * what WakaTime's own editor plugins derive a project name from.
   */
  readonly wakaTimeProject: string | null;
}

export const EMPTY_CATALOG_FACTS: RepositoryCatalogFacts = {
  entityKind: "Component",
  entityType: null,
  techDocsRef: null,
  providesApis: 0,
  hasExternalDocs: false,
  jiraProjectKey: null,
  jiraComponent: null,
  confluenceSpaceKey: null,
  wakaTimeProject: null,
};

/**
 * A repository the plugin ingests, mirrored from a Backstage catalog entity.
 *
 * The catalog is the only source of repositories. Nothing here is enumerated
 * from a provider API, which is what stops the plugin from listing an entire
 * organisation on every dashboard load.
 */
export interface TrackedRepository {
  /** Deterministic id derived from `entityRef`, stable across rediscovery. */
  readonly id: string;
  readonly entityRef: string;
  readonly platform: Platform;
  /** Host of the provider, e.g. `github.com` or `dev.azure.com`. */
  readonly host: string;
  /** GitHub organisation or user, or Azure DevOps organisation. */
  readonly owner: string;
  /** Azure DevOps project. Null on GitHub, which has no such level. */
  readonly project: string | null;
  readonly name: string;
  /** Browsable repository URL, and the key credentials are resolved against. */
  readonly repoUrl: string;
  readonly defaultBranch: string | null;
  /** Provider-side identifier, e.g. the Azure DevOps repository GUID. */
  readonly externalId: string | null;
  /** From the `sonarqube.org/project-key` annotation, when present. */
  readonly sonarProjectKey: string | null;
  readonly catalogFacts: RepositoryCatalogFacts;
  readonly archived: boolean;
  readonly discoveredAt: Date;
  readonly lastSeenAt: Date;
  /** Set when the entity left the catalog; history is kept, ingestion stops. */
  readonly removedAt: Date | null;
}

/** The subset a discovery pass produces, before the store assigns timestamps. */
export type DiscoveredRepository = Omit<
  TrackedRepository,
  "discoveredAt" | "lastSeenAt" | "removedAt"
>;

/** `owner/repo` on GitHub, `organization/project/repo` on Azure DevOps. */
export const repositoryFullName = (repository: {
  owner: string;
  project: string | null;
  name: string;
}): string =>
  repository.project === null
    ? `${repository.owner}/${repository.name}`
    : `${repository.owner}/${repository.project}/${repository.name}`;

/**
 * Identifies the underlying repository, independently of which catalog entity
 * named it.
 *
 * `id` cannot serve this purpose. It is derived from the entity reference — by
 * design, so a row stays put across rediscovery — which means two components
 * that name one repository produce two different ids. Anything deduplicating on
 * `id` therefore compares entities, not repositories, and never collapses them.
 *
 * Case is folded because both providers treat these segments case-insensitively,
 * so the same repository reached through an annotation and through a source
 * location can legitimately differ only in spelling.
 */
export const repositoryIdentity = (repository: {
  platform: Platform;
  host: string;
  owner: string;
  project: string | null;
  name: string;
}): string =>
  `${repository.platform}:${repository.host}/${repositoryFullName(repository)}`.toLowerCase();
