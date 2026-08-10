import { mockServices, TestDatabases } from "@backstage/backend-test-utils";
import type { CodeHealthEvent } from "../../../src/domain/entities/code_health_event";
import { KnexCodeHealthStore } from "../../../src/infrastructure/repositories/knex_code_health_store";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";

/**
 * These run against a real database with the real migrations applied. That is
 * the only way the schema itself gets tested: a hand-rolled double would happily
 * accept a column the migration never created, and the first real deployment
 * would be where that surfaced.
 */
const databases = TestDatabases.create({ ids: ["SQLITE_3"], disableDocker: true });

const NOW = new Date("2026-08-10T12:00:00.000Z");

const createStore = async () => {
  const knex = await databases.init("SQLITE_3");
  const store = await KnexCodeHealthStore.create({ database: mockServices.database({ knex }) });
  return Object.assign(store, { knex });
};

const anEvent = (overrides: Partial<CodeHealthEvent> = {}): CodeHealthEvent => ({
  repositoryId: "unset",
  kind: "commit",
  externalId: "sha-1",
  occurredAt: new Date("2026-08-10T09:00:00.000Z"),
  actorKey: "dev@example.com",
  actorName: "Dev Example",
  actorAvatarUrl: null,
  outcome: null,
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  payload: { messageHeadline: "did the thing" },
  ...overrides,
});

describe("KnexCodeHealthStore", () => {
  describe("syncRepositories", () => {
    it("should insert a repository with a cursor spanning the retention window", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();

      // when
      const result = await store.syncRepositories({
        discovered: [repository],
        retentionDays: 365,
        now: NOW,
      });

      // then
      expect(result.inserted).toEqual([repository.id]);
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.backfillCursor).toBe("2026-08-10");
      expect(tracked.state.backfillFloor).toBe("2025-08-10");
      expect(tracked.state.status).toBe("pending");
    });

    it("should start the incremental cursor a day back so the first run has a window", async () => {
      // given
      const store = await createStore();

      // when
      await store.syncRepositories({
        discovered: [DiscoveredRepositoryBuilder.create().build()],
        retentionDays: 365,
        now: NOW,
      });

      // then
      // Without this the first tick would have nothing to fetch and the
      // dashboard would stay empty until the following one.
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.incrementalThrough).toEqual(new Date("2026-08-09T12:00:00.000Z"));
    });

    it("should refresh an existing repository instead of resetting its cursor", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [],
        chunk: { repositoryId: repository.id, kinds: ["commit"], days: ["2026-08-09"], ingestedAt: NOW },
        backfillCursor: "2026-08-09",
        status: "active",
        now: NOW,
      });

      // when
      const later = new Date("2026-08-11T12:00:00.000Z");
      const result = await store.syncRepositories({
        discovered: [{ ...repository, name: "renamed" }],
        retentionDays: 365,
        now: later,
      });

      // then
      expect(result.inserted).toEqual([]);
      expect(result.updated).toEqual([repository.id]);
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.repository.name).toBe("renamed");
      expect(tracked.state.backfillCursor).toBe("2026-08-09");
    });

    it("should keep facts learnt from the provider when the catalog reports none", async () => {
      // given
      // The catalog never knows the default branch or the provider-side id, so
      // every rediscovery carries nulls for them. Letting those through would
      // erase what ingestion found out on the previous run.
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.updateRepositoryFacts({
        repositoryId: repository.id,
        defaultBranch: "main",
        externalId: "a3f1-guid",
      });

      // when
      await store.syncRepositories({
        discovered: [repository],
        retentionDays: 365,
        now: new Date("2026-08-11T12:00:00.000Z"),
      });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.repository.defaultBranch).toBe("main");
      expect(tracked.repository.externalId).toBe("a3f1-guid");
    });

    it("should soft delete a repository that left the catalog", async () => {
      // given
      const store = await createStore();
      const kept = DiscoveredRepositoryBuilder.create().withEntityRef("component:default/kept").build();
      const dropped = DiscoveredRepositoryBuilder.create()
        .withEntityRef("component:default/dropped")
        .build();
      await store.syncRepositories({ discovered: [kept, dropped], retentionDays: 365, now: NOW });

      // when
      const result = await store.syncRepositories({
        discovered: [kept],
        retentionDays: 365,
        now: NOW,
      });

      // then
      expect(result.removed).toEqual([dropped.id]);
      const tracked = await store.listTrackedRepositories();
      expect(tracked.map((item) => item.repository.id)).toEqual([kept.id]);
    });

    it("should not report the same removal twice", async () => {
      // given
      const store = await createStore();
      const dropped = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [dropped], retentionDays: 365, now: NOW });
      await store.syncRepositories({ discovered: [], retentionDays: 365, now: NOW });

      // when
      const result = await store.syncRepositories({ discovered: [], retentionDays: 365, now: NOW });

      // then
      expect(result.removed).toEqual([]);
    });
  });

  describe("commitIngestion", () => {
    it("should store events, record the days covered and advance the cursor together", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [anEvent({ repositoryId: repository.id })],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2026-08-10"],
          ingestedAt: NOW,
        },
        incrementalThrough: NOW,
        status: "active",
        now: NOW,
      });

      // then
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });
      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({ messageHeadline: "did the thing" });
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.incrementalThrough).toEqual(NOW);
      expect(tracked.state.status).toBe("active");
    });

    it("should record a day that produced no events at all", async () => {
      // given
      // "no data" and "not fetched yet" have to be distinguishable, or the
      // dashboard cannot tell a user which range it is able to answer for.
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit", "build"],
          days: ["2026-08-09"],
          ingestedAt: NOW,
        },
        backfillCursor: "2026-08-09",
        status: "active",
        now: NOW,
      });

      // then
      const coverage = await store.getCoverage();
      expect(coverage.earliestDay).toBe("2026-08-09");
      expect(coverage.latestDay).toBe("2026-08-09");
    });

    it("should be idempotent when the same window is ingested twice", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      const chunk = {
        repositoryId: repository.id,
        kinds: ["commit"] as const,
        days: ["2026-08-10"],
        ingestedAt: NOW,
      };
      const events = [anEvent({ repositoryId: repository.id })];

      // when
      await store.commitIngestion({
        repositoryId: repository.id,
        events,
        chunk,
        status: "active",
        now: NOW,
      });
      await store.commitIngestion({
        repositoryId: repository.id,
        events,
        chunk,
        status: "active",
        now: NOW,
      });

      // then
      // A retry after a partial failure re-fetches a window that may already be
      // stored; that has to update rows in place rather than double count.
      const stored = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });
      expect(stored).toHaveLength(1);
    });

    it("should clear a previous failure when a later run succeeds", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.recordIngestionFailure({
        repositoryId: repository.id,
        error: "429 from the provider",
        now: NOW,
      });

      // when
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2026-08-10"],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.failureCount).toBe(0);
      expect(tracked.state.lastError).toBeNull();
    });
  });

  describe("recordIngestionFailure", () => {
    it("should accumulate the failure count across attempts", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.recordIngestionFailure({ repositoryId: repository.id, error: "one", now: NOW });
      await store.recordIngestionFailure({ repositoryId: repository.id, error: "two", now: NOW });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.failureCount).toBe(2);
      expect(tracked.state.lastError).toBe("two");
      expect(tracked.state.status).toBe("error");
    });

    it("should truncate an error too long for the column", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.recordIngestionFailure({
        repositoryId: repository.id,
        error: "x".repeat(5000),
        now: NOW,
      });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.state.lastError).toHaveLength(2000);
    });
  });

  describe("listEvents", () => {
    it("should exclude events at the exclusive end of the window", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [
          anEvent({
            repositoryId: repository.id,
            externalId: "inside",
            occurredAt: new Date("2026-08-10T23:59:59.000Z"),
          }),
          anEvent({
            repositoryId: repository.id,
            externalId: "outside",
            occurredAt: new Date("2026-08-11T00:00:00.000Z"),
          }),
        ],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2026-08-10"],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });

      // when
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });

      // then
      // Half-open windows are what let consecutive days be requested without
      // counting the boundary event twice.
      expect(events.map((event) => event.externalId)).toEqual(["inside"]);
    });

    it("should filter by kind and by repository", async () => {
      // given
      const store = await createStore();
      const first = DiscoveredRepositoryBuilder.create().withEntityRef("component:default/a").build();
      const second = DiscoveredRepositoryBuilder.create()
        .withEntityRef("component:default/b")
        .build();
      await store.syncRepositories({ discovered: [first, second], retentionDays: 365, now: NOW });
      for (const repository of [first, second]) {
        await store.commitIngestion({
          repositoryId: repository.id,
          events: [
            anEvent({ repositoryId: repository.id, kind: "commit", externalId: "c1" }),
            anEvent({ repositoryId: repository.id, kind: "build", externalId: "b1" }),
          ],
          chunk: {
            repositoryId: repository.id,
            kinds: ["commit", "build"],
            days: ["2026-08-10"],
            ingestedAt: NOW,
          },
          status: "active",
          now: NOW,
        });
      }

      // when
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
        kinds: ["build"],
        repositoryIds: [first.id],
      });

      // then
      expect(events).toHaveLength(1);
      expect(events[0].repositoryId).toBe(first.id);
      expect(events[0].kind).toBe("build");
    });
  });

  describe("listLatestSnapshots", () => {
    it("should return the newest snapshot at or before the requested day", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      const payload = {
        description: null,
        primaryLanguage: "Go",
        visibility: "PUBLIC" as const,
        isArchived: false,
        isFork: false,
        defaultBranch: "main",
        updatedAt: NOW.toISOString(),
        ciStatus: null,
        latestRelease: null,
        latestTag: null,
        branches: ["main"],
        complianceStatus: null,
        badgeStatus: null,
        sonarMetrics: null,
        wakaTimeMetrics: null,
      };
      for (const day of ["2026-08-08", "2026-08-09", "2026-08-11"]) {
        await store.saveSnapshot({
          repositoryId: repository.id,
          day,
          capturedAt: NOW,
          payload: { ...payload, primaryLanguage: day },
        });
      }

      // when
      const snapshots = await store.listLatestSnapshots({ day: "2026-08-10" });

      // then
      // Asking for a past window must render the repository as it was then, not
      // as it is now, so a later snapshot has to be ignored.
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].payload.primaryLanguage).toBe("2026-08-09");
    });

    it("should restrict the result to the requested repositories", async () => {
      // given
      const store = await createStore();
      const first = DiscoveredRepositoryBuilder.create()
        .withEntityRef("component:default/first")
        .build();
      const second = DiscoveredRepositoryBuilder.create()
        .withEntityRef("component:default/second")
        .build();
      await store.syncRepositories({ discovered: [first, second], retentionDays: 365, now: NOW });
      const payload = {
        description: null,
        primaryLanguage: "Go",
        visibility: "PUBLIC" as const,
        isArchived: false,
        isFork: false,
        defaultBranch: "main",
        updatedAt: NOW.toISOString(),
        ciStatus: null,
        latestRelease: null,
        latestTag: null,
        branches: [],
        complianceStatus: null,
        badgeStatus: null,
        sonarMetrics: null,
        wakaTimeMetrics: null,
      };
      for (const repository of [first, second]) {
        await store.saveSnapshot({
          repositoryId: repository.id,
          day: "2026-08-10",
          capturedAt: NOW,
          payload,
        });
      }

      // when
      const snapshots = await store.listLatestSnapshots({
        day: "2026-08-10",
        repositoryIds: [second.id],
      });

      // then
      expect(snapshots.map((snapshot) => snapshot.repositoryId)).toEqual([second.id]);
    });

    it("should overwrite a snapshot captured twice on the same day", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      const payload = {
        description: null,
        primaryLanguage: "Go",
        visibility: "PUBLIC" as const,
        isArchived: false,
        isFork: false,
        defaultBranch: "main",
        updatedAt: NOW.toISOString(),
        ciStatus: null,
        latestRelease: null,
        latestTag: null,
        branches: [],
        complianceStatus: null,
        badgeStatus: null,
        sonarMetrics: null,
        wakaTimeMetrics: null,
      };

      // when
      await store.saveSnapshot({
        repositoryId: repository.id,
        day: "2026-08-10",
        capturedAt: NOW,
        payload,
      });
      await store.saveSnapshot({
        repositoryId: repository.id,
        day: "2026-08-10",
        capturedAt: NOW,
        payload: { ...payload, primaryLanguage: "Rust" },
      });

      // then
      const snapshots = await store.listLatestSnapshots({ day: "2026-08-10" });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].payload.primaryLanguage).toBe("Rust");
    });
  });

  describe("getCoverage", () => {
    it("should report nothing covered before the first ingestion", async () => {
      // given
      const store = await createStore();
      await store.syncRepositories({
        discovered: [DiscoveredRepositoryBuilder.create().build()],
        retentionDays: 365,
        now: NOW,
      });

      // when
      const coverage = await store.getCoverage();

      // then
      expect(coverage.earliestDay).toBeNull();
      expect(coverage.latestDay).toBeNull();
      expect(coverage.repositories).toBe(1);
      expect(coverage.complete).toBe(0);
    });

    it("should count a completed backfill", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2025-08-10"],
          ingestedAt: NOW,
        },
        backfillCursor: "2025-08-10",
        status: "complete",
        now: NOW,
      });

      // then
      const coverage = await store.getCoverage();
      expect(coverage.complete).toBe(1);
      expect(coverage.earliestDay).toBe("2025-08-10");
    });

    it("should exclude a repository that left the catalog from the counts", async () => {
      // given
      const store = await createStore();
      await store.syncRepositories({
        discovered: [DiscoveredRepositoryBuilder.create().build()],
        retentionDays: 365,
        now: NOW,
      });

      // when
      await store.syncRepositories({ discovered: [], retentionDays: 365, now: NOW });

      // then
      const coverage = await store.getCoverage();
      expect(coverage.repositories).toBe(0);
    });
  });

  describe("getTrackedRepository", () => {
    it("should return the repository together with its cursor", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create()
        .withSonarProjectKey("org_repo")
        .build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      const result = await store.getTrackedRepository(repository.id);

      // then
      expect(result?.repository.sonarProjectKey).toBe("org_repo");
      expect(result?.state.repositoryId).toBe(repository.id);
    });

    it("should return nothing for an unknown repository", async () => {
      // given
      const store = await createStore();

      // when
      const result = await store.getTrackedRepository("does-not-exist");

      // then
      expect(result).toBeUndefined();
    });
  });
  describe("updateRepositoryFacts", () => {
    it("should leave the row untouched when nothing was supplied", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.updateRepositoryFacts({
        repositoryId: repository.id,
        defaultBranch: "main",
      });

      // when
      await store.updateRepositoryFacts({ repositoryId: repository.id });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.repository.defaultBranch).toBe("main");
    });

    it("should mark a repository archived once the provider reports it so", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.updateRepositoryFacts({ repositoryId: repository.id, archived: true });

      // then
      const [tracked] = await store.listTrackedRepositories();
      expect(tracked.repository.archived).toBe(true);
    });
  });

  describe("stored payloads", () => {
    it("should read an event back as null when its payload is not valid JSON", async () => {
      // given
      // A row written by an older version, or corrupted in transit, must not
      // take the whole window's read down with it.
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [anEvent({ repositoryId: repository.id })],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2026-08-10"],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });
      await store.knex("code_health_events").update({ payload: "{not json" });

      // when
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });

      // then
      expect(events).toHaveLength(1);
      expect(events[0].payload).toBeNull();
    });

    it("should read an event back as null when its payload is a JSON array", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [anEvent({ repositoryId: repository.id })],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2026-08-10"],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });
      await store.knex("code_health_events").update({ payload: "[1,2,3]" });

      // when
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });

      // then
      expect(events[0].payload).toBeNull();
    });

    it("should store an event with no payload at all", async () => {
      // given
      const store = await createStore();
      const repository = DiscoveredRepositoryBuilder.create().build();
      await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });

      // when
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [anEvent({ repositoryId: repository.id, payload: null })],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: ["2026-08-10"],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });

      // then
      const events = await store.listEvents({
        from: new Date("2026-08-10T00:00:00.000Z"),
        to: new Date("2026-08-11T00:00:00.000Z"),
      });
      expect(events[0].payload).toBeNull();
    });
  });
});
