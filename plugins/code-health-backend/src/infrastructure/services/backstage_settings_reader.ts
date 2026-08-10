import {
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  type SchedulerServiceTaskScheduleDefinition,
} from "@backstage/backend-plugin-api";
import type { Config } from "@backstage/config";
import { parseChunkDays } from "../../domain/entities/day";
import {
  DEFAULT_BACKFILL_CHUNK,
  DEFAULT_CONCURRENCY_PER_HOST,
  DEFAULT_DISCOVERY_SCHEDULE,
  DEFAULT_ENTITY_FILTERS,
  DEFAULT_INGESTION_SCHEDULE,
  DEFAULT_REQUEST_BUDGET_PER_RUN,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_SNAPSHOT_SCHEDULE,
  DEFAULT_WAKATIME_BASE_URL,
  type CodeHealthSettings,
  type EntityFilter,
} from "../../domain/entities/ingestion_settings";

const readSchedule = (
  config: Config | undefined,
  key: string,
  fallback: SchedulerServiceTaskScheduleDefinition,
): SchedulerServiceTaskScheduleDefinition => {
  const scheduleConfig = config?.getOptionalConfig(key);
  if (!scheduleConfig) return fallback;
  return readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig);
};

const readPositiveNumber = (
  config: Config | undefined,
  key: string,
  fallback: number,
): number => {
  const value = config?.getOptionalNumber(key);
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
};

const readEntityFilters = (config: Config | undefined): readonly EntityFilter[] => {
  const filters = config?.getOptional("catalog.entityFilter");
  if (!Array.isArray(filters) || filters.length === 0) return DEFAULT_ENTITY_FILTERS;

  const parsed = filters.filter(
    (filter): filter is EntityFilter =>
      typeof filter === "object" && filter !== null && !Array.isArray(filter),
  );
  return parsed.length > 0 ? parsed : DEFAULT_ENTITY_FILTERS;
};

/**
 * Reads the `codeHealth` block, filling in defaults for everything absent.
 *
 * Provider credentials are intentionally not read here. They come from the host
 * application's `integrations` configuration, so an operator who has already
 * configured Backstage for GitHub or Azure DevOps configures nothing further.
 */
export const readCodeHealthSettings = (rootConfig: Config): CodeHealthSettings => {
  const config = rootConfig.getOptionalConfig("codeHealth");
  const ingestion = config?.getOptionalConfig("ingestion");

  return {
    ingestion: {
      entityFilters: readEntityFilters(config),
      retentionDays: readPositiveNumber(ingestion, "retentionDays", DEFAULT_RETENTION_DAYS),
      backfillChunkDays: parseChunkDays(
        ingestion?.getOptionalString("backfillChunk") ?? DEFAULT_BACKFILL_CHUNK,
        1,
      ),
      requestBudgetPerRun: readPositiveNumber(
        ingestion,
        "requestBudgetPerRun",
        DEFAULT_REQUEST_BUDGET_PER_RUN,
      ),
      concurrencyPerHost: readPositiveNumber(
        ingestion,
        "concurrencyPerHost",
        DEFAULT_CONCURRENCY_PER_HOST,
      ),
      schedule: readSchedule(ingestion, "schedule", DEFAULT_INGESTION_SCHEDULE),
      discoverySchedule: readSchedule(
        ingestion,
        "discoverySchedule",
        DEFAULT_DISCOVERY_SCHEDULE,
      ),
      snapshotSchedule: readSchedule(ingestion, "snapshotSchedule", DEFAULT_SNAPSHOT_SCHEDULE),
    },
    sonar: {
      enabled: config?.getOptionalBoolean("sonar.enabled") ?? false,
    },
    wakaTime: {
      organization: config?.getOptionalString("wakaTime.organization") ?? null,
      apiKey: config?.getOptionalString("wakaTime.apiKey") ?? null,
      baseUrl: config?.getOptionalString("wakaTime.baseUrl") ?? DEFAULT_WAKATIME_BASE_URL,
    },
  };
};
