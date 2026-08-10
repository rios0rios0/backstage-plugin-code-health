import type { SchedulerServiceTaskScheduleDefinition } from "@backstage/backend-plugin-api";

/** Catalog filters, in the shape `catalog.getEntities` expects. */
export type EntityFilter = Record<string, string | string[]>;

export interface IngestionSettings {
  readonly entityFilters: readonly EntityFilter[];
  readonly retentionDays: number;
  /** Days fetched per backfill step. 1 walks the history a day at a time. */
  readonly backfillChunkDays: number;
  readonly requestBudgetPerRun: number;
  readonly concurrencyPerHost: number;
  readonly schedule: SchedulerServiceTaskScheduleDefinition;
  readonly discoverySchedule: SchedulerServiceTaskScheduleDefinition;
  readonly snapshotSchedule: SchedulerServiceTaskScheduleDefinition;
}

export interface SonarSettings {
  readonly enabled: boolean;
}

export interface WakaTimeSettings {
  readonly organization: string | null;
  readonly apiKey: string | null;
  readonly baseUrl: string;
}

export interface CodeHealthSettings {
  readonly ingestion: IngestionSettings;
  readonly sonar: SonarSettings;
  readonly wakaTime: WakaTimeSettings;
}

export const DEFAULT_ENTITY_FILTERS: readonly EntityFilter[] = [{ kind: "Component" }];

export const DEFAULT_RETENTION_DAYS = 365;
export const DEFAULT_BACKFILL_CHUNK = "P1D";
export const DEFAULT_REQUEST_BUDGET_PER_RUN = 500;
export const DEFAULT_CONCURRENCY_PER_HOST = 4;
export const DEFAULT_WAKATIME_BASE_URL = "https://wakatime.com/api/v1";

export const DEFAULT_INGESTION_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { minutes: 5 },
  timeout: { minutes: 15 },
  initialDelay: { seconds: 30 },
  scope: "global",
};

export const DEFAULT_DISCOVERY_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { minutes: 30 },
  timeout: { minutes: 10 },
  initialDelay: { seconds: 10 },
  scope: "global",
};

export const DEFAULT_SNAPSHOT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { cron: "0 3 * * *" },
  timeout: { hours: 1 },
  initialDelay: { minutes: 2 },
  scope: "global",
};
