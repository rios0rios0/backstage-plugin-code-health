import type {
  ContributorSummary,
  CoverageInfo,
  RepositorySummary,
  TimeSeriesBucket,
  TimeSeriesPoint,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * Everything the dashboard reads.
 *
 * All three are answered by the Code Health backend from data it already
 * ingested, so the browser never contacts a version control provider and a
 * dashboard load costs the same regardless of how many repositories exist.
 */
export interface DashboardService {
  listRepositories(window: TimeWindow): Promise<RepositorySummary[]>;
}

export interface ContributorService {
  listContributors(window: TimeWindow, repositoryId?: string): Promise<ContributorSummary[]>;
}

/**
 * How much history the backend has collected.
 *
 * The dashboard uses this to bound its range picker: a freshly installed plugin
 * can only answer for the last few hours, and the selectable window widens
 * backwards from today as the backfill advances.
 */
export interface CoverageService {
  getCoverage(): Promise<CoverageInfo>;
  /** Asks the backend to run its ingestion tasks now. */
  refresh(): Promise<void>;
}

/**
 * Fleet-wide activity over time.
 *
 * Answered from the same ingested events the tables read, bucketed by the
 * backend so the browser never receives one row per commit.
 */
export interface TimeSeriesService {
  getTimeSeries(window: TimeWindow, bucket: TimeSeriesBucket): Promise<TimeSeriesPoint[]>;
}
