export type IngestionStatus = "pending" | "active" | "complete" | "error";

/**
 * Where the background actor has got to for one repository.
 *
 * Two cursors move independently. `incrementalThrough` walks forwards and keeps
 * the dashboard current; `backfillCursor` walks backwards towards
 * `backfillFloor` and is what widens the selectable time range. The forward
 * cursor always gets the request budget first, so a freshly installed plugin
 * can answer for the last day before it has any history at all.
 */
export interface IngestionState {
  readonly repositoryId: string;
  /** Oldest day the backfill is walking towards, as `YYYY-MM-DD`. */
  readonly backfillFloor: string;
  /** Next day boundary to fetch, exclusive, as `YYYY-MM-DD`. */
  readonly backfillCursor: string;
  readonly incrementalThrough: Date;
  readonly status: IngestionStatus;
  readonly failureCount: number;
  readonly lastError: string | null;
  readonly lastAttemptAt: Date | null;
}

/** True once the backfill has reached the retention floor. */
export const isBackfillComplete = (state: IngestionState): boolean =>
  state.backfillCursor <= state.backfillFloor;
