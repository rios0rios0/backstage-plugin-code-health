import type { Repository } from "../../domain/entities/repository";
import type { CIState, Release, Tag, WorkflowStatus } from "@rios0rios0/backstage-plugin-code-health-common";
import type { GraphQLRepositoryNode } from "./graphql_repository_node";

const VALID_CI_STATES = new Set<string>(["SUCCESS", "FAILURE", "PENDING", "ERROR", "EXPECTED"]);

const mapCIStatus = (node: GraphQLRepositoryNode): WorkflowStatus | null => {
  const ref = node.defaultBranchRef;
  if (!ref) return null;

  const { target } = ref;
  const rollupState = target.statusCheckRollup?.state;

  if (!rollupState || !VALID_CI_STATES.has(rollupState)) return null;

  return {
    state: rollupState as CIState,
    commitSha: target.oid,
    commitMessage: target.messageHeadline,
    commitUrl: target.commitUrl,
  };
};

const mapRelease = (node: GraphQLRepositoryNode): Release | null => {
  if (!node.latestRelease) return null;

  return {
    tagName: node.latestRelease.tagName,
    name: node.latestRelease.name,
    publishedAt: node.latestRelease.publishedAt,
    url: node.latestRelease.url,
    isPrerelease: node.latestRelease.isPrerelease,
  };
};

const mapTag = (node: GraphQLRepositoryNode): Tag | null => {
  const [firstTag] = node.refs.nodes;
  if (!firstTag) return null;

  return {
    name: firstTag.name,
    commitSha: firstTag.target.oid,
  };
};

export const mapGraphQLNodeToRepository = (node: GraphQLRepositoryNode): Repository => ({
  id: node.id,
  name: node.name,
  fullName: node.nameWithOwner,
  url: node.url,
  description: node.description,
  primaryLanguage: node.primaryLanguage?.name ?? null,
  visibility: node.visibility,
  isArchived: node.isArchived,
  isFork: node.isFork,
  defaultBranch: node.defaultBranchRef?.name ?? "main",
  updatedAt: node.updatedAt,
  ciStatus: mapCIStatus(node),
  latestRelease: mapRelease(node),
  latestTag: mapTag(node),
  hasWorkflows: Boolean(node.defaultBranchRef?.target.statusCheckRollup),
  branches: node.branchRefs.nodes.map((ref) => ref.name),
  sonarMetrics: null,
  complianceStatus: null,
  badgeStatus: null,
});
