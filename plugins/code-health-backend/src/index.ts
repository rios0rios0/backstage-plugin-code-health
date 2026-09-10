/**
 * Backstage backend plugin for the Code Health dashboard.
 *
 * @packageDocumentation
 */

export {
  codeHealthPlugin as default,
  DISCOVERY_TASK_ID,
  INGESTION_TASK_ID,
  SNAPSHOT_TASK_ID,
} from "./plugin";

// Exported so a host's permission policy can name what it is deciding about.
// Without this the only way to refuse a reset would be to guess the string.
export {
  codeHealthIngestionResetPermission,
  codeHealthPermissions,
} from "./domain/entities/permissions";
