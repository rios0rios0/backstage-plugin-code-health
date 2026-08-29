import type {
  JiraContributorMetrics,
  JiraRepositoryMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { Day } from "../entities/day";
import type { TrackedRepository } from "../entities/tracked_repository";
import type { EnrichmentContext } from "./snapshot_enricher";

/**
 * Adds Jira delivery measures to a snapshot run.
 *
 * Split in two because the two questions have different keys and different
 * scopes. Per-person measures are keyed by Atlassian `accountId` and span every
 * project the catalog names, so they are gathered once for the whole fleet;
 * per-repository measures are keyed by tracked repository and scoped by the
 * `jira/project-key` annotation on its entity.
 *
 * Both may legitimately return an empty map. Jira is optional, a repository's
 * entity may name no project, and neither is a failure — a repository with no
 * Jira row renders nothing rather than rendering zeroes, which is the
 * difference between "this team does not track work here" and "this team closed
 * nothing".
 */
export interface JiraEnricher {
  /** Per-person measures for the whole window, keyed by Atlassian accountId. */
  fetchContributors(
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, JiraContributorMetrics>>;

  /**
   * The same window sliced into calendar days.
   *
   * Offered because it costs nothing: the implementation fetches the whole
   * window's issues once, so slicing them per day is arithmetic rather than
   * traffic — and it is the difference between a range picker that can answer
   * for last March and one that shows a trailing window relabelled with
   * March's dates. Days with no activity are absent rather than empty, so the
   * store keeps "nobody did anything" distinguishable from "not collected".
   */
  fetchContributorsByDay(
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<Day, ReadonlyMap<string, JiraContributorMetrics>>>;

  /** Per-repository measures, keyed by tracked repository id. */
  fetchRepositories(
    repositories: readonly TrackedRepository[],
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, JiraRepositoryMetrics>>;
}
