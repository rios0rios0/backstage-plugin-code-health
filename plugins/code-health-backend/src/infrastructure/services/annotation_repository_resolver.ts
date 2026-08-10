import {
  getEntitySourceLocation,
  stringifyEntityRef,
  type Entity,
} from "@backstage/catalog-model";
import type { ScmIntegrationRegistry } from "@backstage/integration";
import { createHash } from "node:crypto";
import type { RepositoryResolver } from "../../domain/services/repository_resolver";
import type { DiscoveredRepository } from "../../domain/entities/tracked_repository";

/**
 * Annotation names are string literals rather than imported constants on
 * purpose. The catalog keeps `github.com/project-slug` and
 * `dev.azure.com/project-repo` module-private in a processor that is itself
 * deprecated, and the Azure DevOps constants now live in a community package
 * this plugin would otherwise have to depend on for two strings.
 */
const GITHUB_SLUG_ANNOTATION = "github.com/project-slug";
const AZURE_REPO_ANNOTATION = "dev.azure.com/project-repo";
const AZURE_HOST_ORG_ANNOTATION = "dev.azure.com/host-org";
const AZURE_PROJECT_ANNOTATION = "dev.azure.com/project";
const SONAR_PROJECT_KEY_ANNOTATION = "sonarqube.org/project-key";

const DEFAULT_GITHUB_HOST = "github.com";
const DEFAULT_AZURE_HOST = "dev.azure.com";

/** Stable, filesystem- and URL-safe id derived from the entity reference. */
export const repositoryIdFor = (entityRef: string): string =>
  createHash("sha256").update(entityRef).digest("hex").slice(0, 32);

const annotation = (entity: Entity, name: string): string | undefined => {
  const value = entity.metadata.annotations?.[name];
  return value === undefined || value === "" ? undefined : value;
};

const sourceLocationUrl = (entity: Entity): string | undefined => {
  try {
    const location = getEntitySourceLocation(entity);
    return location.type === "url" ? location.target : undefined;
  } catch {
    // An entity with no location annotation at all throws rather than
    // returning undefined; that is a normal case here, not an error.
    return undefined;
  }
};

const fromGithubSlug = (
  entity: Entity,
  host: string,
): Omit<DiscoveredRepository, "sonarProjectKey"> | null => {
  const slug = annotation(entity, GITHUB_SLUG_ANNOTATION);
  if (!slug) return null;

  const [owner, name, ...rest] = slug.split("/");
  if (!owner || !name || rest.length > 0) return null;

  return {
    id: repositoryIdFor(stringifyEntityRef(entity)),
    entityRef: stringifyEntityRef(entity),
    platform: "github",
    host,
    owner,
    project: null,
    name,
    repoUrl: `https://${host}/${owner}/${name}`,
    defaultBranch: null,
    externalId: null,
    archived: false,
  };
};

const fromAzureAnnotations = (
  entity: Entity,
  host: string,
  organization: string | undefined,
): Omit<DiscoveredRepository, "sonarProjectKey"> | null => {
  const projectRepo = annotation(entity, AZURE_REPO_ANNOTATION);
  if (!projectRepo) return null;

  const [project, name, ...rest] = projectRepo.split("/");
  if (!project || !name || rest.length > 0) return null;

  // `dev.azure.com/host-org` carries `host/organization`; without it the
  // organisation has to come from `dev.azure.com/project` or the source
  // location, because `project-repo` alone does not name one.
  const owner = organization ?? annotation(entity, AZURE_PROJECT_ANNOTATION);
  if (!owner) return null;

  return {
    id: repositoryIdFor(stringifyEntityRef(entity)),
    entityRef: stringifyEntityRef(entity),
    platform: "azure-devops",
    host,
    owner,
    project,
    name,
    repoUrl: `https://${host}/${owner}/${project}/_git/${name}`,
    defaultBranch: null,
    externalId: null,
    archived: false,
  };
};

const splitHostOrg = (value: string | undefined): { host?: string; organization?: string } => {
  if (!value) return {};
  const [host, organization, ...rest] = value.split("/");
  if (!host || !organization || rest.length > 0) return {};
  return { host, organization };
};

const fromSourceLocation = (
  entity: Entity,
  integrations: ScmIntegrationRegistry,
): Omit<DiscoveredRepository, "sonarProjectKey"> | null => {
  const target = sourceLocationUrl(entity);
  if (!target) return null;

  // `byUrl` parses the target itself and returns undefined when it cannot, so
  // reaching past this guard means the URL is known to be well formed.
  const integration = integrations.byUrl(target);
  if (!integration) return null;

  const url = new URL(target);
  const segments = url.pathname.split("/").filter(Boolean);
  const entityRef = stringifyEntityRef(entity);

  if (integration.type === "github") {
    const [owner, name] = segments;
    if (!owner || !name) return null;
    return {
      id: repositoryIdFor(entityRef),
      entityRef,
      platform: "github",
      host: url.host,
      owner,
      project: null,
      name: name.replace(/\.git$/, ""),
      repoUrl: `${url.origin}/${owner}/${name.replace(/\.git$/, "")}`,
      defaultBranch: null,
      externalId: null,
      archived: false,
    };
  }

  if (integration.type === "azure") {
    // Both `https://host/org/project/_git/repo` and the on-premises
    // `https://host/tfs/org/project/_git/repo` shapes end with the same three
    // segments, so anchoring on `_git` avoids having to know which is in play.
    const gitIndex = segments.indexOf("_git");
    if (gitIndex < 2 || gitIndex + 1 >= segments.length) return null;
    const owner = segments[gitIndex - 2];
    const project = segments[gitIndex - 1];
    const name = segments[gitIndex + 1];
    if (!owner || !project || !name) return null;
    return {
      id: repositoryIdFor(entityRef),
      entityRef,
      platform: "azure-devops",
      host: url.host,
      owner,
      project,
      name,
      repoUrl: `${url.origin}/${owner}/${project}/_git/${name}`,
      defaultBranch: null,
      externalId: null,
      archived: false,
    };
  }

  return null;
};

/**
 * Resolves a catalog entity to a repository, preferring the provider-specific
 * annotations and falling back to `backstage.io/source-location`.
 *
 * The fallback is what makes the plugin work with entities registered by
 * Backstage's own discovery providers, which always set a source location but
 * only set a slug annotation when the corresponding processor is installed.
 */
export class AnnotationRepositoryResolver implements RepositoryResolver {
  constructor(private readonly integrations: ScmIntegrationRegistry) {}

  resolve(entity: Entity): DiscoveredRepository | null {
    const hostOrg = splitHostOrg(annotation(entity, AZURE_HOST_ORG_ANNOTATION));

    const resolved =
      fromGithubSlug(entity, DEFAULT_GITHUB_HOST) ??
      fromAzureAnnotations(entity, hostOrg.host ?? DEFAULT_AZURE_HOST, hostOrg.organization) ??
      fromSourceLocation(entity, this.integrations);

    if (!resolved) return null;

    return {
      ...resolved,
      sonarProjectKey: annotation(entity, SONAR_PROJECT_KEY_ANNOTATION) ?? null,
    };
  }
}
