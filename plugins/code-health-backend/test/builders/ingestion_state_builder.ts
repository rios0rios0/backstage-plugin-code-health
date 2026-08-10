import type { IngestionState } from "../../src/domain/entities/ingestion_state";

export const anIngestionState = (overrides: Partial<IngestionState> = {}): IngestionState => ({
  repositoryId: "repository-1",
  backfillFloor: "2025-08-10",
  backfillCursor: "2026-08-10",
  incrementalThrough: new Date("2026-08-09T00:00:00.000Z"),
  status: "pending",
  failureCount: 0,
  lastError: null,
  lastAttemptAt: null,
  ...overrides,
});
