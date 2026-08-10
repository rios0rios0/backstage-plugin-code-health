import type { TrackedRepository } from "../../src/domain/entities/tracked_repository";

const DISCOVERED_AT = new Date("2026-08-01T00:00:00.000Z");

export const aTrackedRepository = (
  overrides: Partial<TrackedRepository> = {},
): TrackedRepository => ({
  id: "repository-1",
  entityRef: "component:default/gateway",
  platform: "github",
  host: "github.com",
  owner: "rios0rios0",
  project: null,
  name: "pipelines",
  repoUrl: "https://github.com/rios0rios0/pipelines",
  defaultBranch: null,
  externalId: null,
  sonarProjectKey: null,
  archived: false,
  discoveredAt: DISCOVERED_AT,
  lastSeenAt: DISCOVERED_AT,
  removedAt: null,
  ...overrides,
});

export const anAzureRepository = (
  baseUrl: string,
  overrides: Partial<TrackedRepository> = {},
): TrackedRepository =>
  aTrackedRepository({
    platform: "azure-devops",
    host: new URL(baseUrl).host,
    owner: "example-org",
    project: "platform",
    name: "gateway",
    repoUrl: `${baseUrl}/example-org/platform/_git/gateway`,
    ...overrides,
  });
