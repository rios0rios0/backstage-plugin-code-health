import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";

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
