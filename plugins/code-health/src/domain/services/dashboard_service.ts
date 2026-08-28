import type {
  ContributorSummary,
  CoverageInfo,
  IdentityRow,
  IdentitySource,
  IntegrationCapabilities,
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

/**
 * Which optional integrations the backend was configured with.
 *
 * Asked once, before anything is drawn. Inferring it from whether any row
 * carries a value cannot tell a switched-off integration from one that is on
 * and has not collected yet, and those want completely different words on the
 * screen — as well as making a freshly configured install look broken for a day.
 */
export interface IntegrationsService {
  getCapabilities(): Promise<IntegrationCapabilities>;
}

/**
 * The accounts the plugin has seen, and which person each belongs to.
 *
 * This is the only write the dashboard makes. Everything else is a read of what
 * a scheduled task already collected; linking two accounts is a statement only
 * a person can make, and it is what turns three partial rows into one.
 */
export interface IdentityService {
  listIdentities(filter: {
    sources?: readonly IdentitySource[];
    linked?: boolean;
  }): Promise<IdentityRow[]>;

  linkIdentity(link: {
    source: IdentitySource;
    sourceKey: string;
    entityRef: string;
  }): Promise<void>;

  unlinkIdentity(identity: {
    source: IdentitySource;
    sourceKey: string;
  }): Promise<void>;
}
