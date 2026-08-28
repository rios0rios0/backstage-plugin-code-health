import type {
  ConfluenceContributorMetrics,
  ConfluenceSpaceMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { TrackedRepository } from "../entities/tracked_repository";
import type { EnrichmentContext } from "./snapshot_enricher";

/**
 * Reads Confluence productivity measures for a snapshot pass.
 *
 * Split in two because the two questions have different shapes and different
 * costs. `fetchContributors` sweeps the whole configured scope once — people
 * are not partitioned by repository, and asking per repository would multiply
 * one answer by the repository count, which is the mistake the WakaTime
 * enricher exists not to repeat. `fetchRepositories` answers per space, and
 * only for repositories whose catalog entity actually names one.
 *
 * Both report the accounts they saw to the `IdentityObserver` they were built
 * with. An Atlassian `accountId` is the same handle in Jira, so linking it once
 * lands both products' figures on one contributor row — and an account that
 * wrote nothing this quarter is still an account somebody may need to link,
 * which is why the identities are reported from the sweep rather than inferred
 * from the numbers that came out of it.
 *
 * Returning an empty map is a normal outcome: Confluence switched off, no
 * `confluence.io/space-key` annotation anywhere in the catalog, or a run whose
 * request budget went on version control. None of those is a failure of the
 * snapshot.
 */
export interface ConfluenceEnricher {
  /** Per-person measures for the whole window, keyed by Atlassian `accountId`. */
  fetchContributors(
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, ConfluenceContributorMetrics>>;

  /** Per-repository measures, keyed by tracked repository id. */
  fetchRepositories(
    repositories: readonly TrackedRepository[],
    context: EnrichmentContext,
  ): Promise<ReadonlyMap<string, ConfluenceSpaceMetrics>>;
}
