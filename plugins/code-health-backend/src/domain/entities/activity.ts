import type { RepositoryActivity } from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_REPOSITORY_ACTIVITY } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "./code_health_event";

/**
 * Reduces a window's events to the counters the dashboard shows.
 *
 * This is the only place the numbers are defined, and it runs over the stored
 * events rather than over a pre-aggregated table. Keeping the events as the
 * source of truth means a change of definition — say, counting a
 * partially-succeeded build as a success — reinterprets the whole history
 * instead of only what is ingested afterwards.
 */
export const aggregateActivity = (
  events: readonly CodeHealthEvent[],
): RepositoryActivity => {
  const contributors = new Set<string>();

  const totals = events.reduce(
    (accumulator, event) => {
      if (event.actorKey) contributors.add(event.actorKey);

      switch (event.kind) {
        case "commit":
          return {
            ...accumulator,
            commits: accumulator.commits + 1,
            additions: accumulator.additions + (event.additions ?? 0),
            deletions: accumulator.deletions + (event.deletions ?? 0),
            changedFiles: accumulator.changedFiles + (event.changedFiles ?? 0),
          };
        case "pull_request":
          // An opened and a closed event are stored separately, so a pull
          // request that spans two windows counts once in each rather than
          // forcing "merged" to mean "opened here and merged later".
          if (event.outcome === "open") {
            return { ...accumulator, pullRequestsOpened: accumulator.pullRequestsOpened + 1 };
          }
          if (event.outcome === "merged") {
            return { ...accumulator, pullRequestsMerged: accumulator.pullRequestsMerged + 1 };
          }
          return {
            ...accumulator,
            pullRequestsAbandoned: accumulator.pullRequestsAbandoned + 1,
          };
        case "build":
          return {
            ...accumulator,
            builds: accumulator.builds + 1,
            buildsSucceeded:
              accumulator.buildsSucceeded + (event.outcome === "succeeded" ? 1 : 0),
            buildsFailed: accumulator.buildsFailed + (event.outcome === "failed" ? 1 : 0),
          };
        case "release":
          return { ...accumulator, releases: accumulator.releases + 1 };
        case "tag":
          return { ...accumulator, tags: accumulator.tags + 1 };
        default:
          // Reviews carry an actor and so widen the contributor count, but they
          // are not activity of their own at the repository level.
          return accumulator;
      }
    },
    { ...EMPTY_REPOSITORY_ACTIVITY },
  );

  return { ...totals, contributors: contributors.size };
};
