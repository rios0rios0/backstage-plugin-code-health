import type { Repository } from "./repository";

export type CIFilter = "all" | "passing" | "failing" | "no-ci";
export type ReleaseFilter = "all" | "has-release" | "no-release";
export type SortField = "name" | "updatedAt" | "ciStatus" | "releaseDate" | "language" | "latestTag" | "visibility";
export type SortDirection = "asc" | "desc";

export interface DashboardFilter {
  readonly searchQuery: string;
  readonly ciFilter: CIFilter;
  readonly releaseFilter: ReleaseFilter;
  readonly languageFilter: string | null;
  readonly showArchived: boolean;
  readonly showForks: boolean;
  readonly sortField: SortField;
  readonly sortDirection: SortDirection;
}

export const DEFAULT_FILTER: DashboardFilter = {
  searchQuery: "",
  ciFilter: "all",
  releaseFilter: "all",
  languageFilter: null,
  showArchived: false,
  showForks: false,
  sortField: "name",
  sortDirection: "asc",
};

const matchesCIFilter = (repo: Repository, filter: CIFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "no-ci") return repo.ciStatus === null;
  if (filter === "passing") return repo.ciStatus?.state === "SUCCESS";
  return repo.ciStatus !== null && repo.ciStatus.state !== "SUCCESS";
};

const matchesReleaseFilter = (repo: Repository, filter: ReleaseFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "has-release") return repo.latestRelease !== null;
  return repo.latestRelease === null;
};

export const filterRepositories = (
  repositories: readonly Repository[],
  filter: DashboardFilter,
): Repository[] => {
  return repositories.filter((repo) => {
    if (filter.searchQuery && !repo.name.toLowerCase().includes(filter.searchQuery.toLowerCase())) {
      return false;
    }
    if (!matchesCIFilter(repo, filter.ciFilter)) return false;
    if (!matchesReleaseFilter(repo, filter.releaseFilter)) return false;
    if (filter.languageFilter && repo.primaryLanguage !== filter.languageFilter) return false;
    if (!filter.showArchived && repo.isArchived) return false;
    if (!filter.showForks && repo.isFork) return false;
    return true;
  });
};

const CI_STATE_ORDER: Record<string, number> = {
  FAILURE: 0,
  ERROR: 1,
  PENDING: 2,
  EXPECTED: 3,
  SUCCESS: 4,
  NONE: 5,
};

export const sortRepositories = (
  repositories: readonly Repository[],
  field: SortField,
  direction: SortDirection,
): Repository[] => {
  const sorted = [...repositories].sort((a, b) => {
    switch (field) {
      case "name":
        return a.name.localeCompare(b.name);
      case "updatedAt":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "ciStatus": {
        const stateA = a.ciStatus?.state ?? "NONE";
        const stateB = b.ciStatus?.state ?? "NONE";
        return (CI_STATE_ORDER[stateA] ?? 5) - (CI_STATE_ORDER[stateB] ?? 5);
      }
      case "releaseDate": {
        const dateA = a.latestRelease?.publishedAt ?? "";
        const dateB = b.latestRelease?.publishedAt ?? "";
        return dateB.localeCompare(dateA);
      }
      case "language":
        return (a.primaryLanguage ?? "").localeCompare(b.primaryLanguage ?? "");
      case "latestTag":
        return (a.latestTag?.name ?? "").localeCompare(b.latestTag?.name ?? "");
      case "visibility":
        return a.visibility.localeCompare(b.visibility);
      default:
        return 0;
    }
  });
  return direction === "desc" ? sorted.reverse() : sorted;
};
