import type { Contributor } from "./contributor";

export type ContributorSortField =
  | "username"
  | "linesOfCode"
  | "approvedPRs"
  | "prApprovalRate"
  | "pipelineSuccessRate"
  | "bugs"
  | "codeSmells"
  | "securityHotspots"
  | "vulnerabilities"
  | "coverage"
  | "duplications"
  | "technicalDebt";

export type SortDirection = "asc" | "desc";

export interface ContributorFilter {
  readonly searchQuery: string;
  readonly sortField: ContributorSortField;
  readonly sortDirection: SortDirection;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

export const DEFAULT_CONTRIBUTOR_FILTER: ContributorFilter = {
  searchQuery: "",
  sortField: "linesOfCode",
  sortDirection: "desc",
  dateFrom: null,
  dateTo: null,
};

export const filterContributors = (
  contributors: readonly Contributor[],
  filter: ContributorFilter,
): Contributor[] => {
  return contributors.filter((contributor) => {
    if (
      filter.searchQuery &&
      !contributor.username.toLowerCase().includes(filter.searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
};

const parseTechnicalDebt = (debt: string): number => {
  let minutes = 0;
  const dayMatch = debt.match(/(\d+)d/);
  const hourMatch = debt.match(/(\d+)h/);
  const minMatch = debt.match(/(\d+)min/);
  if (dayMatch) minutes += parseInt(dayMatch[1], 10) * 8 * 60;
  if (hourMatch) minutes += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) minutes += parseInt(minMatch[1], 10);
  return minutes;
};

const getSonarNumericValue = (contributor: Contributor, field: ContributorSortField): number => {
  if (!contributor.sonarMetrics) return 0;
  switch (field) {
    case "bugs":
      return contributor.sonarMetrics.bugs;
    case "codeSmells":
      return contributor.sonarMetrics.codeSmells;
    case "securityHotspots":
      return contributor.sonarMetrics.securityHotspots;
    case "vulnerabilities":
      return contributor.sonarMetrics.vulnerabilities;
    case "coverage":
      return contributor.sonarMetrics.coverage;
    case "duplications":
      return contributor.sonarMetrics.duplications;
    case "technicalDebt":
      return parseTechnicalDebt(contributor.sonarMetrics.technicalDebt);
    default:
      return 0;
  }
};

export const sortContributors = (
  contributors: readonly Contributor[],
  field: ContributorSortField,
  direction: SortDirection,
): Contributor[] => {
  const sorted = [...contributors].sort((a, b) => {
    switch (field) {
      case "username":
        return a.username.localeCompare(b.username);
      case "linesOfCode":
        return a.linesOfCode - b.linesOfCode;
      case "approvedPRs":
        return a.approvedPRs - b.approvedPRs;
      case "prApprovalRate":
        return a.prApprovalRate - b.prApprovalRate;
      case "pipelineSuccessRate":
        return a.pipelineSuccessRate - b.pipelineSuccessRate;
      case "bugs":
      case "codeSmells":
      case "securityHotspots":
      case "vulnerabilities":
      case "coverage":
      case "duplications":
      case "technicalDebt":
        return getSonarNumericValue(a, field) - getSonarNumericValue(b, field);
      default:
        return 0;
    }
  });
  return direction === "desc" ? sorted.reverse() : sorted;
};
