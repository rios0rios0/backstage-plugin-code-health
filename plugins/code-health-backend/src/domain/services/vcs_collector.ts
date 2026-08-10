import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../entities/code_health_event";
import type { RequestBudget } from "../entities/request_budget";
import type { TrackedRepository } from "../entities/tracked_repository";

/** A half-open window `[from, to)`. */
export interface CollectionWindow {
  readonly from: Date;
  readonly to: Date;
}

export interface CollectorContext {
  readonly budget: RequestBudget;
  readonly signal?: AbortSignal;
}

/**
 * Facts about the repository itself that only the provider knows.
 *
 * The catalog cannot supply these — it does not track a default branch or an
 * Azure DevOps repository GUID — so they are learnt while collecting and stored
 * separately from anything discovery writes.
 */
export interface LearntRepositoryFacts {
  readonly defaultBranch?: string | null;
  readonly externalId?: string | null;
  readonly archived?: boolean;
}

export interface CollectedFacts {
  readonly events: readonly CodeHealthEvent[];
  readonly repositoryFacts?: LearntRepositoryFacts;
}

/**
 * Reads a window of a repository's history from its provider.
 *
 * Only the facts both providers can filter by date are collected here —
 * commits, pull requests and pipeline runs. Releases and tags are current-state
 * facts the dashboard shows as "latest", and Azure DevOps cannot date a tag
 * without resolving each annotated object, so they are captured by the snapshot
 * task instead of being faked into the event stream.
 */
export interface VcsCollector {
  readonly platform: Platform;

  collect(
    repository: TrackedRepository,
    window: CollectionWindow,
    context: CollectorContext,
  ): Promise<CollectedFacts>;
}
