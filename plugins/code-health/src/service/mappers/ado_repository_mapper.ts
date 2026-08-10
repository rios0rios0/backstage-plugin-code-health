import type { Repository } from "../../domain/entities/repository";
import type { Tag } from "../../domain/entities/tag";
import type { CIState, WorkflowStatus } from "../../domain/entities/workflow_status";
import type { AdoBuildNode, AdoRefNode, AdoRepositoryNode } from "./ado_repository_node";

const mapBuildResult = (build: AdoBuildNode): CIState => {
  if (build.status !== "completed") return "PENDING";

  const resultHandlers: Record<string, CIState> = {
    succeeded: "SUCCESS",
    failed: "FAILURE",
    canceled: "ERROR",
    partiallySucceeded: "PENDING",
  };
  return resultHandlers[build.result ?? ""] ?? "NONE";
};

const mapCIStatus = (build: AdoBuildNode | null): WorkflowStatus | null => {
  if (!build) return null;

  return {
    state: mapBuildResult(build),
    commitSha: build.sourceVersion,
    commitMessage: `Build ${build.buildNumber}`,
    commitUrl: build._links?.web?.href ?? "",
  };
};

const mapTag = (ref: AdoRefNode | null): Tag | null => {
  if (!ref) return null;

  return {
    name: ref.name.replace("refs/tags/", ""),
    commitSha: ref.peeledObjectId ?? ref.objectId,
  };
};

export const mapAdoRepoToRepository = (
  repo: AdoRepositoryNode,
  build: AdoBuildNode | null,
  tagRef: AdoRefNode | null,
  org: string,
  branches: string[] = [],
): Repository => {
  const ciStatus = mapCIStatus(build);

  return {
    id: repo.id,
    name: repo.name,
    fullName: `${org}/${repo.project.name}/${repo.name}`,
    url: repo.webUrl,
    description: repo.project.description,
    primaryLanguage: null,
    visibility: repo.project.visibility === "private" ? "PRIVATE" : "PUBLIC",
    isArchived: repo.isDisabled,
    isFork: repo.isFork,
    defaultBranch: repo.defaultBranch?.replace("refs/heads/", "") ?? "main",
    updatedAt: build?.finishTime ?? new Date(0).toISOString(),
    ciStatus,
    latestRelease: null,
    latestTag: mapTag(tagRef),
    hasWorkflows: build !== null,
    branches,
    sonarMetrics: null,
    complianceStatus: null,
    badgeStatus: null,
  };
};
