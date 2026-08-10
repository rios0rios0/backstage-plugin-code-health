import type { RepositorySummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_REPOSITORY_ACTIVITY } from "@rios0rios0/backstage-plugin-code-health-common";
import { aggregateActivity } from "../entities/activity";
import type { CodeHealthEvent } from "../entities/code_health_event";
import { toDay } from "../entities/day";
import type { RepositorySnapshotPayload } from "../entities/repository_snapshot";
import { repositoryFullName, type TrackedRepository } from "../entities/tracked_repository";
import type { CodeHealthStore } from "../repositories/code_health_store";

/**
 * State for a repository that has never been snapshotted.
 *
 * A freshly discovered repository has activity before it has a snapshot,
 * because ingestion runs every few minutes and the snapshot task runs daily. It
 * renders with its counters and empty state rather than being hidden, which
 * would make the dashboard look like discovery had not worked.
 */
const unsnapshotted = (repository: TrackedRepository): RepositorySnapshotPayload => ({
  description: null,
  primaryLanguage: null,
  visibility: "PRIVATE",
  isArchived: repository.archived,
  isFork: false,
  defaultBranch: repository.defaultBranch ?? "",
  updatedAt: repository.discoveredAt.toISOString(),
  ciStatus: null,
  latestRelease: null,
  latestTag: null,
  branches: [],
  complianceStatus: null,
  badgeStatus: null,
  sonarMetrics: null,
  wakaTimeMetrics: null,
});

export class ListRepositorySummaries {
  constructor(private readonly store: CodeHealthStore) {}

  /**
   * Builds one dashboard row per tracked repository.
   *
   * The counters come from the events inside the window; everything else comes
   * from the most recent snapshot taken at or before the *end* of the window,
   * so asking about a past period renders the repository as it was then rather
   * than as it is now.
   */
  async run(input: { from: Date; to: Date }): Promise<RepositorySummary[]> {
    const [tracked, events, snapshots] = await Promise.all([
      this.store.listTrackedRepositories(),
      this.store.listEvents({ from: input.from, to: input.to }),
      this.store.listLatestSnapshots({ day: toDay(input.to) }),
    ]);

    const eventsByRepository = new Map<string, CodeHealthEvent[]>();
    for (const event of events) {
      const bucket = eventsByRepository.get(event.repositoryId);
      if (bucket) bucket.push(event);
      else eventsByRepository.set(event.repositoryId, [event]);
    }

    const snapshotsByRepository = new Map(
      snapshots.map((snapshot) => [snapshot.repositoryId, snapshot.payload]),
    );

    return tracked.map(({ repository }) => {
      const payload = snapshotsByRepository.get(repository.id) ?? unsnapshotted(repository);
      const repositoryEvents = eventsByRepository.get(repository.id);

      return {
        id: repository.id,
        entityRef: repository.entityRef,
        platform: repository.platform,
        name: repository.name,
        fullName: repositoryFullName(repository),
        url: repository.repoUrl,
        description: payload.description,
        primaryLanguage: payload.primaryLanguage,
        visibility: payload.visibility,
        isArchived: payload.isArchived,
        isFork: payload.isFork,
        defaultBranch: payload.defaultBranch,
        updatedAt: payload.updatedAt,
        ciStatus: payload.ciStatus,
        latestRelease: payload.latestRelease,
        latestTag: payload.latestTag,
        branches: payload.branches,
        sonarMetrics: payload.sonarMetrics,
        complianceStatus: payload.complianceStatus,
        badgeStatus: payload.badgeStatus,
        wakaTimeMetrics: payload.wakaTimeMetrics,
        activity: repositoryEvents
          ? aggregateActivity(repositoryEvents)
          : EMPTY_REPOSITORY_ACTIVITY,
      };
    });
  }
}
