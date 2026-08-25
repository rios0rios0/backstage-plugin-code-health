import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../../src/domain/entities/code_health_event";
import type { TrackedRepository } from "../../src/domain/entities/tracked_repository";
import type {
  CollectedFacts,
  CollectionWindow,
  CollectorContext,
  ProviderSnapshot,
  SnapshotContext,
  VcsCollector,
} from "../../src/domain/services/vcs_collector";

export interface RecordedCollection {
  readonly entityRef: string;
  readonly from: Date;
  readonly to: Date;
}

/**
 * In-memory collector.
 *
 * It records the windows it was asked for and can be told to spend budget or to
 * fail, which is what makes the actor's phase ordering, cursor discipline and
 * error handling observable without a provider.
 */
export class StubVcsCollector implements VcsCollector {
  private events: CodeHealthEvent[] = [];
  private facts: CollectedFacts["repositoryFacts"];
  private failures = new Map<string, Error>();
  private requestsPerCollect = 0;

  readonly calls: RecordedCollection[] = [];

  constructor(readonly platform: Platform = "github") {}

  withEvents(events: CodeHealthEvent[]): StubVcsCollector {
    this.events = events;
    return this;
  }

  withFacts(facts: CollectedFacts["repositoryFacts"]): StubVcsCollector {
    this.facts = facts;
    return this;
  }

  /** Fails every collection for the given entity reference. */
  withFailureFor(entityRef: string, error: Error): StubVcsCollector {
    this.failures.set(entityRef, error);
    return this;
  }

  /** Consumes this many requests from the budget on each collection. */
  withRequestCost(requests: number): StubVcsCollector {
    this.requestsPerCollect = requests;
    return this;
  }

  async collect(
    repository: TrackedRepository,
    window: CollectionWindow,
    context: CollectorContext,
  ): Promise<CollectedFacts> {
    this.calls.push({
      entityRef: repository.entityRef,
      from: window.from,
      to: window.to,
    });

    for (let index = 0; index < this.requestsPerCollect; index += 1) {
      context.budget.consume();
    }

    const failure = this.failures.get(repository.entityRef);
    if (failure) throw failure;

    return {
      events: this.events.map((event) => ({ ...event, repositoryId: repository.id })),
      ...(this.facts === undefined ? {} : { repositoryFacts: this.facts }),
    };
  }

  private snapshotPayload: ProviderSnapshot["payload"] = {
    description: null,
    primaryLanguage: null,
    visibility: "PUBLIC",
    isArchived: false,
    isFork: false,
    defaultBranch: "main",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ciStatus: null,
    latestRelease: null,
    latestTag: null,
    branches: ["main"],
    complianceStatus: null,
    badgeStatus: null,
    repositoryFiles: null,
  };

  private snapshotEvents: CodeHealthEvent[] = [];

  /** Repositories a snapshot was taken of, in order. */
  readonly snapshots: string[] = [];

  withSnapshot(payload: Partial<ProviderSnapshot["payload"]>): StubVcsCollector {
    this.snapshotPayload = { ...this.snapshotPayload, ...payload };
    return this;
  }

  withSnapshotEvents(events: CodeHealthEvent[]): StubVcsCollector {
    this.snapshotEvents = events;
    return this;
  }

  async snapshot(
    repository: TrackedRepository,
    context: SnapshotContext,
  ): Promise<ProviderSnapshot> {
    this.snapshots.push(repository.entityRef);

    for (let index = 0; index < this.requestsPerCollect; index += 1) {
      context.budget.consume();
    }

    const failure = this.failures.get(repository.entityRef);
    if (failure) throw failure;

    return {
      payload: this.snapshotPayload,
      events: this.snapshotEvents.map((event) => ({ ...event, repositoryId: repository.id })),
      ...(this.facts === undefined ? {} : { repositoryFacts: this.facts }),
    };
  }

  /** Windows requested for one repository, in order. */
  callsFor(entityRef: string): RecordedCollection[] {
    return this.calls.filter((call) => call.entityRef === entityRef);
  }
}
