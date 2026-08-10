import type { EventKind } from "@rios0rios0/backstage-plugin-code-health-common";

/** Outcome of a build, a pull request, or a review vote. */
export type EventOutcome =
  | "succeeded"
  | "failed"
  | "canceled"
  | "merged"
  | "abandoned"
  | "open"
  | "approved"
  | "approved_with_suggestions"
  | "rejected"
  | "waiting"
  | "no_vote";

/**
 * One dated fact ingested from a provider.
 *
 * The shape is deliberately uniform across kinds so the whole history is one
 * indexed table: contributors are a `GROUP BY actorKey`, pipeline success rates
 * are a `GROUP BY outcome`, and neither needs a rollup table to stay fast.
 */
export interface CodeHealthEvent {
  readonly repositoryId: string;
  readonly kind: EventKind;
  /** Provider-side identifier, unique within the repository and kind. */
  readonly externalId: string;
  readonly occurredAt: Date;
  /** Normalised author identity, or null for events with no actor. */
  readonly actorKey: string | null;
  readonly actorName: string | null;
  readonly actorAvatarUrl: string | null;
  readonly outcome: EventOutcome | null;
  /** Lines added. Null on Azure DevOps, which reports files rather than lines. */
  readonly additions: number | null;
  readonly deletions: number | null;
  readonly changedFiles: number | null;
  /** Provider-specific extras: commit sha, title, url, pull request id. */
  readonly payload: Record<string, unknown> | null;
}

/** Primary key of an event row, and the reason re-ingestion is idempotent. */
export const eventId = (event: {
  repositoryId: string;
  kind: EventKind;
  externalId: string;
}): string => `${event.repositoryId}:${event.kind}:${event.externalId}`;
