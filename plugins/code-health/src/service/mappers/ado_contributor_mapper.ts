import type { Contributor } from "../../domain/entities/contributor";
import type { AdoPullRequestNode } from "./ado_contributor_node";

interface ContributorAccumulator {
  username: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  approvedPRs: number;
  totalPRs: number;
  rejectedPRs: number;
}

const createEmptyAccumulator = (
  username: string,
  displayName: string,
  avatarUrl: string,
  profileUrl: string,
): ContributorAccumulator => ({
  username,
  displayName,
  avatarUrl,
  profileUrl,
  approvedPRs: 0,
  totalPRs: 0,
  rejectedPRs: 0,
});

const hasApproval = (pr: AdoPullRequestNode): boolean =>
  pr.reviewers.some((r) => r.vote >= 5);

const hasRejection = (pr: AdoPullRequestNode): boolean =>
  pr.reviewers.some((r) => r.vote === -10);

export const mapAdoPullRequestsToContributors = (
  pullRequests: AdoPullRequestNode[],
): Contributor[] => {
  const accumulators = new Map<string, ContributorAccumulator>();

  for (const pr of pullRequests) {
    const { uniqueName, displayName, imageUrl, url } = pr.createdBy;
    let acc = accumulators.get(uniqueName);
    if (!acc) {
      acc = createEmptyAccumulator(uniqueName, displayName, imageUrl, url);
      accumulators.set(uniqueName, acc);
    }

    acc.totalPRs++;

    if (hasApproval(pr)) {
      acc.approvedPRs++;
    }
    if (hasRejection(pr)) {
      acc.rejectedPRs++;
    }
  }

  return [...accumulators.values()].map(
    (acc): Contributor => ({
      username: acc.displayName || acc.username,
      avatarUrl: acc.avatarUrl,
      profileUrl: acc.profileUrl,
      approvedPRs: acc.approvedPRs,
      totalPRs: acc.totalPRs,
      rejectedPRs: acc.rejectedPRs,
      // TODO: ADO PR list API does not include line change stats.
      // Fetching per-PR iteration stats would require N+1 API calls.
      linesOfCode: 0,
      linesAdded: 0,
      linesDeleted: 0,
      prApprovalRate:
        acc.totalPRs > 0 ? ((acc.totalPRs - acc.rejectedPRs) / acc.totalPRs) * 100 : 0,
      // TODO: pipeline stats per PR require cross-referencing builds with PR commits
      pipelineSuccessRate: 0,
      totalPipelineRuns: 0,
      successfulPipelineRuns: 0,
      sonarMetrics: null,
      wakaTimeMetrics: null,
    }),
  );
};
