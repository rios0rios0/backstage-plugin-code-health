import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import { IngestRepositoryHistory } from "../../../src/domain/commands/ingest_repository_history";
import type { CodeHealthEvent } from "../../../src/domain/entities/code_health_event";
import {
  DEFAULT_DISCOVERY_SCHEDULE,
  DEFAULT_INGESTION_SCHEDULE,
  DEFAULT_SNAPSHOT_SCHEDULE,
  type IngestionSettings,
} from "../../../src/domain/entities/ingestion_settings";
import { CircuitOpenError } from "../../../src/domain/entities/provider_errors";
import type { VcsCollector } from "../../../src/domain/services/vcs_collector";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { RecordingIdentityObserver } from "../../doubles/recording_identity_observer";
import { RecordingLogger } from "../../doubles/recording_logger";
import { StubVcsCollector } from "../../doubles/stub_vcs_collector";

const NOW = new Date("2026-08-10T12:00:00.000Z");

const settings = (overrides: Partial<IngestionSettings> = {}): IngestionSettings => ({
  entityFilters: [{ kind: "Component" }],
  retentionDays: 365,
  backfillChunkDays: 1,
  requestBudgetPerRun: 500,
  concurrencyPerHost: 4,
  schedule: DEFAULT_INGESTION_SCHEDULE,
  discoverySchedule: DEFAULT_DISCOVERY_SCHEDULE,
  snapshotSchedule: DEFAULT_SNAPSHOT_SCHEDULE,
  ...overrides,
});

const aCommit = (overrides: Partial<CodeHealthEvent> = {}): CodeHealthEvent => ({
  repositoryId: "unset",
  kind: "commit",
  externalId: "sha-1",
  occurredAt: new Date("2026-08-10T09:00:00.000Z"),
  actorKey: "dev@example.com",
  actorName: "Dev",
  actorAvatarUrl: null,
  outcome: null,
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  payload: null,
  ...overrides,
});

const createActor = async (options: {
  repositories?: number;
  collector?: StubVcsCollector;
  overrides?: Partial<IngestionSettings>;
  entityRefs?: string[];
}) => {
  const store = new InMemoryCodeHealthStore();
  const logger = new RecordingLogger();
  const collector = options.collector ?? new StubVcsCollector();

  const refs =
    options.entityRefs ??
    Array.from({ length: options.repositories ?? 1 }, (_unused, index) =>
      `component:default/repo-${index}`,
    );

  await store.syncRepositories({
    discovered: refs.map((entityRef) =>
      DiscoveredRepositoryBuilder.create().withEntityRef(entityRef).build(),
    ),
    retentionDays: 365,
    now: NOW,
  });

  const collectors: ReadonlyMap<Platform, VcsCollector> = new Map([["github", collector]]);
  const identities = new RecordingIdentityObserver();
  const actor = new IngestRepositoryHistory({
    store,
    identities,
    collectors,
    settings: settings(options.overrides),
    logger,
  });

  return { actor, store, collector, logger, identities };
};

describe("IngestRepositoryHistory", () => {
  describe("the incremental phase", () => {
    it("should move a repository's cursor forward to now", async () => {
      // given
      const { actor, store } = await createActor({});

      // when
      await actor.run({ now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.incrementalThrough).toEqual(NOW);
    });

    it("should ask for the window between the cursor and now", async () => {
      // given
      // The cursor starts a day back so the very first run has something to
      // fetch and the dashboard can answer for "the last day" immediately.
      const { actor, collector } = await createActor({});

      // when
      await actor.run({ now: NOW });

      // then
      const [first] = collector.calls;
      expect(first.from).toEqual(new Date("2026-08-09T12:00:00.000Z"));
      expect(first.to).toEqual(NOW);
    });

    it("should cap a stale cursor at one chunk so it catches up over several runs", async () => {
      // given
      // A backend that was down for a week must not ask a provider for a week
      // of history in one call.
      const { actor, store, collector } = await createActor({});
      const [tracked] = await store.listTrackedRepositories();
      await store.commitIngestion({
        repositoryId: tracked.repository.id,
        events: [],
        chunk: { repositoryId: tracked.repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
        incrementalThrough: new Date("2026-08-03T12:00:00.000Z"),
        status: "active",
        now: NOW,
      });

      // when
      await actor.run({ now: NOW });

      // then
      const [first] = collector.calls;
      expect(first.from).toEqual(new Date("2026-08-03T12:00:00.000Z"));
      expect(first.to).toEqual(new Date("2026-08-04T12:00:00.000Z"));
    });

    it("should serve the stalest repository first", async () => {
      // given
      const { actor, store, collector } = await createActor({ repositories: 3 });
      const tracked = await store.listTrackedRepositories();
      await store.commitIngestion({
        repositoryId: tracked[2].repository.id,
        events: [],
        chunk: {
          repositoryId: tracked[2].repository.id,
          kinds: ["commit"],
          days: [],
          ingestedAt: NOW,
        },
        incrementalThrough: new Date("2026-08-01T00:00:00.000Z"),
        status: "active",
        now: NOW,
      });

      // when
      await actor.run({ now: NOW });

      // then
      // Otherwise a repository at the end of the list would starve whenever the
      // allowance ran out before reaching it.
      expect(collector.calls[0].entityRef).toBe(tracked[2].repository.entityRef);
    });

    it("should not record a partial day as fetched", async () => {
      // given
      // An allowance of one request buys the incremental window and nothing
      // else, so this observes that phase alone. Its window runs from midday
      // yesterday to midday today, covering neither day end to end; recording
      // one would make the dashboard offer a range it can only answer part of.
      const collector = new StubVcsCollector().withRequestCost(1);
      const { actor, store } = await createActor({
        collector,
        overrides: { requestBudgetPerRun: 1 },
      });

      // when
      const result = await actor.run({ now: NOW });

      // then
      expect(result.refreshed).toBe(1);
      expect(result.backfilled).toBe(0);
      const coverage = await store.getCoverage();
      expect(coverage.earliestDay).toBeNull();
      expect(coverage.latestDay).toBeNull();
    });

    it("should record a day once the window covers it completely", async () => {
      // given
      const { actor, store } = await createActor({});
      const [tracked] = await store.listTrackedRepositories();
      await store.commitIngestion({
        repositoryId: tracked.repository.id,
        events: [],
        chunk: { repositoryId: tracked.repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
        incrementalThrough: new Date("2026-08-09T00:00:00.000Z"),
        status: "active",
        now: NOW,
      });

      // when
      await actor.run({ now: new Date("2026-08-10T00:00:00.000Z") });

      // then
      const coverage = await store.getCoverage();
      expect(coverage.earliestDay).toBe("2026-08-09");
    });

    it("should store the events the collector returned", async () => {
      // given
      const collector = new StubVcsCollector().withEvents([aCommit()]);
      const { actor, store } = await createActor({ collector });

      // when
      const result = await actor.run({ now: NOW });

      // then
      // Both phases run and both return the same commit, so it is written
      // twice and stored once — which is the idempotency the event key exists
      // for.
      expect(result.eventsWritten).toBe(2);
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });
      expect(events).toHaveLength(1);
    });

    it("should record the facts the collector learnt about the repository", async () => {
      // given
      const collector = new StubVcsCollector().withFacts({
        defaultBranch: "main",
        externalId: "12345",
        archived: true,
      });
      const { actor, store } = await createActor({ collector });

      // when
      await actor.run({ now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.repository).toMatchObject({
        defaultBranch: "main",
        externalId: "12345",
        archived: true,
      });
    });
  });

  describe("the backfill phase", () => {
    it("should walk backwards one chunk at a time", async () => {
      // given
      const { actor, collector } = await createActor({});

      // when
      await actor.run({ now: NOW });

      // then
      const backfill = collector.calls[1];
      expect(backfill.from).toEqual(new Date("2026-08-09T00:00:00.000Z"));
      expect(backfill.to).toEqual(new Date("2026-08-10T00:00:00.000Z"));
    });

    it("should move the cursor only after the window was stored", async () => {
      // given
      const { actor, store } = await createActor({});

      // when
      await actor.run({ now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.backfillCursor).toBe("2026-08-09");
    });

    it("should honour a larger chunk size", async () => {
      // given
      const { actor, collector } = await createActor({ overrides: { backfillChunkDays: 7 } });

      // when
      await actor.run({ now: NOW });

      // then
      // Raising the chunk finishes the backfill proportionally faster, because
      // both providers accept an arbitrary range in a single request.
      const backfill = collector.calls[1];
      expect(backfill.from).toEqual(new Date("2026-08-03T00:00:00.000Z"));
    });

    it("should stop at the retention floor rather than walking past it", async () => {
      // given
      const { actor, store } = await createActor({ overrides: { backfillChunkDays: 400 } });

      // when
      await actor.run({ now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.backfillCursor).toBe("2025-08-10");
      expect(tracked.state.status).toBe("complete");
    });

    it("should leave a completed repository alone on later runs", async () => {
      // given
      const { actor, collector } = await createActor({ overrides: { backfillChunkDays: 400 } });
      await actor.run({ now: NOW });
      const afterFirst = collector.calls.length;

      // when
      await actor.run({ now: new Date("2026-08-10T13:00:00.000Z") });

      // then
      // Only the incremental phase should touch it now; a second backfill call
      // would re-fetch a year that is already stored.
      expect(collector.calls.length).toBe(afterFirst + 1);
    });

    it("should take the newest gap first", async () => {
      // given
      const { actor, store, collector } = await createActor({ repositories: 2 });
      const tracked = await store.listTrackedRepositories();
      await store.commitIngestion({
        repositoryId: tracked[0].repository.id,
        events: [],
        chunk: {
          repositoryId: tracked[0].repository.id,
          kinds: ["commit"],
          days: [],
          ingestedAt: NOW,
        },
        backfillCursor: "2026-01-01",
        status: "active",
        now: NOW,
      });

      // when
      await actor.run({ now: NOW });

      // then
      // A user gains "the last month" long before "the whole year", which is the
      // order the data becomes useful in.
      const backfillCalls = collector.calls.slice(2);
      expect(backfillCalls[0].entityRef).toBe(tracked[1].repository.entityRef);
    });
  });

  describe("phase ordering", () => {
    it("should refresh every repository before backfilling any", async () => {
      // given
      // The dashboard has to stay current no matter how much history is still
      // outstanding, so the forward cursor always gets the allowance first.
      const { actor, store, collector } = await createActor({ repositories: 3 });
      const tracked = await store.listTrackedRepositories();

      // when
      await actor.run({ now: NOW });

      // then
      const firstThree = collector.calls.slice(0, 3).map((call) => call.entityRef).sort();
      expect(firstThree).toEqual(tracked.map((entry) => entry.repository.entityRef).sort());
    });

    it("should spend the whole allowance on refreshing rather than starting a backfill", async () => {
      // given
      const collector = new StubVcsCollector().withRequestCost(2);
      const { actor } = await createActor({
        repositories: 5,
        collector,
        overrides: { requestBudgetPerRun: 6 },
      });

      // when
      const result = await actor.run({ now: NOW });

      // then
      expect(result.refreshed).toBe(3);
      expect(result.backfilled).toBe(0);
      expect(result.budgetExhausted).toBe(true);
    });

    it("should resume from where the previous run stopped", async () => {
      // given
      const collector = new StubVcsCollector().withRequestCost(2);
      const { actor, store } = await createActor({
        repositories: 4,
        collector,
        overrides: { requestBudgetPerRun: 4 },
      });
      await actor.run({ now: NOW });

      // when
      const later = new Date("2026-08-10T12:05:00.000Z");
      await actor.run({ now: later });

      // then
      // The two repositories left behind are now the stalest, so they are the
      // ones served next; nothing starves.
      const tracked = await store.listTrackedRepositories();
      expect(tracked.filter((entry) => entry.state.incrementalThrough >= NOW)).toHaveLength(4);
    });
  });

  describe("failures", () => {
    it("should leave the cursor untouched when a window fails", async () => {
      // given
      // Advancing past unfetched data would put a permanent hole in the history
      // that nothing later would notice.
      const collector = new StubVcsCollector().withFailureFor(
        "component:default/repo-0",
        new Error("provider request failed with 500"),
      );
      const { actor, store } = await createActor({ collector });

      // when
      const result = await actor.run({ now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.incrementalThrough).toEqual(new Date("2026-08-09T12:00:00.000Z"));
      expect(tracked.state.backfillCursor).toBe("2026-08-10");
      expect(result.failures).toBeGreaterThan(0);
    });

    it("should record the failure against the repository", async () => {
      // given
      const collector = new StubVcsCollector().withFailureFor(
        "component:default/repo-0",
        new Error("boom"),
      );
      const { actor, store } = await createActor({ collector });

      // when
      await actor.run({ now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.status).toBe("error");
      expect(tracked.state.lastError).toContain("boom");
    });

    it("should carry on with the other repositories", async () => {
      // given
      const collector = new StubVcsCollector().withFailureFor(
        "component:default/repo-0",
        new Error("boom"),
      );
      const { actor, store } = await createActor({ repositories: 3, collector });

      // when
      await actor.run({ now: NOW });

      // then
      const tracked = await store.listTrackedRepositories();
      const healthy = tracked.filter((entry) => entry.state.status !== "error");
      expect(healthy).toHaveLength(2);
    });

    it("should skip the rest of a host that is in cooldown", async () => {
      // given
      // Every other repository on that host would fail identically, so they are
      // left for the next run rather than each recording a failure of its own.
      const collector = new StubVcsCollector();
      const { actor, store, logger } = await createActor({ repositories: 3, collector });
      const tracked = await store.listTrackedRepositories();
      for (const entry of tracked) {
        collector.withFailureFor(
          entry.repository.entityRef,
          new CircuitOpenError("github.com", 0),
        );
      }

      // when
      const result = await actor.run({ now: NOW });

      // then
      expect(result.failures).toBe(0);
      expect(result.skippedHosts).toEqual(["github.com"]);
      expect(collector.calls).toHaveLength(1);
      expect(logger.at("warn").join(" ")).toContain("in cooldown");
    });

    it("should fail loudly when no collector is registered for a platform", async () => {
      // given
      const store = new InMemoryCodeHealthStore();
      await store.syncRepositories({
        discovered: [
          DiscoveredRepositoryBuilder.create()
            .asAzureDevOps("example-org", "platform")
            .build(),
        ],
        retentionDays: 365,
        now: NOW,
      });
      const actor = new IngestRepositoryHistory({
        store,
        identities: new RecordingIdentityObserver(),
        collectors: new Map(),
        settings: settings(),
        logger: new RecordingLogger(),
      });

      // when
      const result = await actor.run({ now: NOW });

      // then
      expect(result.failures).toBeGreaterThan(0);
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.lastError).toContain("no collector is registered");
    });
  });

  describe("cancellation", () => {
    it("should stop when the scheduled task is aborted", async () => {
      // given
      // The scheduler aborts on timeout; continuing would keep issuing provider
      // requests the run is no longer allowed to make.
      const controller = new AbortController();
      controller.abort();
      const { actor, collector } = await createActor({ repositories: 3 });

      // when
      const result = await actor.run({ now: NOW, signal: controller.signal });

      // then
      expect(collector.calls).toEqual([]);
      expect(result.refreshed).toBe(0);
    });
  });
});
