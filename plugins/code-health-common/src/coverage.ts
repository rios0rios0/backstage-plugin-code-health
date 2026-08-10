/**
 * How much history the background ingestion has actually collected.
 *
 * The dashboard uses this to bound its time range picker: a freshly installed
 * plugin can only answer for the last few hours, and the selectable window
 * widens backwards from today as the backfill advances.
 */
export interface BackfillProgress {
  /** Repositories the discovery task is tracking. */
  readonly repositories: number;
  /** Repositories whose backfill has reached the retention floor. */
  readonly complete: number;
  /** Repository-days still to fetch across every tracked repository. */
  readonly pendingDays: number;
  /** Repository-days already fetched, including today's incremental window. */
  readonly ingestedDays: number;
  /** `ingestedDays` as a percentage of the total, rounded to one decimal. */
  readonly percent: number;
  /** Repositories whose last ingestion attempt failed. */
  readonly failing: number;
}

export interface CoverageInfo {
  /**
   * Earliest day any repository has data for, as `YYYY-MM-DD`, or null before
   * the first ingestion tick completes. This is the floor of the range a user
   * is allowed to select.
   */
  readonly earliestDay: string | null;
  /** Latest day covered, as `YYYY-MM-DD`, or null before the first tick. */
  readonly latestDay: string | null;
  /** When the ingestion task last wrote anything, as an ISO 8601 instant. */
  readonly lastIngestedAt: string | null;
  readonly backfill: BackfillProgress;
}

export const EMPTY_BACKFILL_PROGRESS: BackfillProgress = {
  repositories: 0,
  complete: 0,
  pendingDays: 0,
  ingestedDays: 0,
  percent: 0,
  failing: 0,
};
