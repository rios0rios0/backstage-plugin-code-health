import type { Contributor } from "../../domain/entities/contributor";
import type { GraphQLPullRequestNode } from "./graphql_contributor_node";

interface ContributorAccumulator {
  username: string;
  avatarUrl: string;
  profileUrl: string;
  approvedPRs: number;
  totalPRs: number;
  rejectedPRs: number;
  linesAdded: number;
  linesDeleted: number;
  successfulPipelineRuns: number;
  totalPipelineRuns: number;
}

const createEmptyAccumulator = (
  username: string,
  avatarUrl: string,
  profileUrl: string,
): ContributorAccumulator => ({
  username,
  avatarUrl,
  profileUrl,
  approvedPRs: 0,
  totalPRs: 0,
  rejectedPRs: 0,
  linesAdded: 0,
  linesDeleted: 0,
  successfulPipelineRuns: 0,
  totalPipelineRuns: 0,
});

const hasReviewState = (
  pr: GraphQLPullRequestNode,
  state: "APPROVED" | "CHANGES_REQUESTED",
): boolean => pr.reviews.nodes.some((r) => r.state === state);

export const mapPullRequestsToContributors = (
  pullRequests: GraphQLPullRequestNode[],
): Contributor[] => {
  const accumulators = new Map<string, ContributorAccumulator>();

  for (const pr of pullRequests) {
    if (!pr.author) continue;

    const { login, avatarUrl, url } = pr.author;
    let acc = accumulators.get(login);
    if (!acc) {
      acc = createEmptyAccumulator(login, avatarUrl, url);
      accumulators.set(login, acc);
    }

    acc.totalPRs++;
    acc.linesAdded += pr.additions;
    acc.linesDeleted += pr.deletions;

    if (hasReviewState(pr, "APPROVED")) {
      acc.approvedPRs++;
    }
    if (hasReviewState(pr, "CHANGES_REQUESTED")) {
      acc.rejectedPRs++;
    }

    const lastCommit = pr.commits.nodes[pr.commits.nodes.length - 1];
    if (lastCommit?.commit.statusCheckRollup) {
      acc.totalPipelineRuns++;
      if (lastCommit.commit.statusCheckRollup.state === "SUCCESS") {
        acc.successfulPipelineRuns++;
      }
    }
  }

  return [...accumulators.values()].map(
    (acc): Contributor => ({
      username: acc.username,
      avatarUrl: acc.avatarUrl,
      profileUrl: acc.profileUrl,
      approvedPRs: acc.approvedPRs,
      totalPRs: acc.totalPRs,
      rejectedPRs: acc.rejectedPRs,
      linesOfCode: acc.linesAdded + acc.linesDeleted,
      linesAdded: acc.linesAdded,
      linesDeleted: acc.linesDeleted,
      prApprovalRate:
        acc.totalPRs > 0 ? ((acc.totalPRs - acc.rejectedPRs) / acc.totalPRs) * 100 : 0,
      pipelineSuccessRate:
        acc.totalPipelineRuns > 0
          ? (acc.successfulPipelineRuns / acc.totalPipelineRuns) * 100
          : 0,
      totalPipelineRuns: acc.totalPipelineRuns,
      successfulPipelineRuns: acc.successfulPipelineRuns,
      sonarMetrics: null,
      wakaTimeMetrics: null,
    }),
  );
};
