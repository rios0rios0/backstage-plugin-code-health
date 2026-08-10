/**
 * The dated facts the backend ingests from a version control platform.
 *
 * Each one is queryable by date range on both GitHub and Azure DevOps, which is
 * what makes the day-by-day backfill possible. Anything whose past state is not
 * queryable — compliance checks, README badges, Sonar measures — is captured as
 * a daily snapshot instead and never appears here.
 */
export type EventKind = "commit" | "pull_request" | "pr_review" | "build" | "release" | "tag";

export const EVENT_KINDS: readonly EventKind[] = [
  "commit",
  "pull_request",
  "pr_review",
  "build",
  "release",
  "tag",
];

export const isEventKind = (value: string): value is EventKind =>
  (EVENT_KINDS as readonly string[]).includes(value);
