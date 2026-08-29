import type {
  Platform,
  SonarMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { CaptureRepositorySnapshots } from "../../../src/domain/commands/capture_repository_snapshots";
import {
  DEFAULT_DISCOVERY_SCHEDULE,
  DEFAULT_INGESTION_SCHEDULE,
  DEFAULT_SNAPSHOT_SCHEDULE,
  type IngestionSettings,
} from "../../../src/domain/entities/ingestion_settings";
import type { Day } from "../../../src/domain/entities/day";
import { CircuitOpenError } from "../../../src/domain/entities/provider_errors";
import type { TrackedRepository } from "../../../src/domain/entities/tracked_repository";
import type {
  EnrichmentContext,
  SonarEnricher,
  WakaTimeEnricher,
  WakaTimeHarvest,
} from "../../../src/domain/services/snapshot_enricher";
import type { ConfluenceEnricher } from "../../../src/domain/services/confluence_enricher";
import type { ObservedIdentity } from "../../../src/domain/services/identity_resolver";
import type { JiraEnricher } from "../../../src/domain/services/jira_enricher";
import type { VcsCollector } from "../../../src/domain/services/vcs_collector";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { WakaTimeMetricsBuilder } from "../../builders/wakatime_metrics_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { RecordingIdentityObserver } from "../../doubles/recording_identity_observer";
import { RecordingLogger } from "../../doubles/recording_logger";
import { StubVcsCollector } from "../../doubles/stub_vcs_collector";

const NOW = new Date("2026-08-10T03:00:00.000Z");

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

class StubSonarEnricher implements SonarEnricher {
  constructor(private readonly metrics: SonarMetrics | null) {}

  readonly calls: string[] = [];

  async fetch(repository: TrackedRepository): Promise<SonarMetrics | null> {
    this.calls.push(repository.entityRef);
    return this.metrics;
  }
}

class StubWakaTimeEnricher implements WakaTimeEnricher {
  private failure: Error | null = null;

  callCount = 0;
  /** The window the command asked for, so a test can assert on the span. */
  lastRequest: { from: Day; to: Day; aiDays: readonly Day[] } | null = null;

  constructor(
    private readonly byDay: ReadonlyMap<Day, ReadonlyMap<string, WakaTimeMetrics>> = new Map(),
    private readonly identities: readonly ObservedIdentity[] = [],
  ) {}

  withFailure(failure: Error): StubWakaTimeEnricher {
    this.failure = failure;
    return this;
  }

  async fetchWindow(input: {
    from: Day;
    to: Day;
    aiDays: readonly Day[];
    context: EnrichmentContext;
  }): Promise<WakaTimeHarvest> {
    this.callCount += 1;
    this.lastRequest = { from: input.from, to: input.to, aiDays: input.aiDays };
    if (this.failure) throw this.failure;
    return { identities: this.identities, byDay: this.byDay };
  }
}

const createCommand = async (options: {
  repositories?: number;
  collector?: StubVcsCollector;
  sonar?: SonarEnricher | null;
  wakaTime?: WakaTimeEnricher | null;
  wakaTimeWindow?: { historyDays: number; aiDays: number };
  jira?: JiraEnricher | null;
  confluence?: ConfluenceEnricher | null;
  overrides?: Partial<IngestionSettings>;
}) => {
  const store = new InMemoryCodeHealthStore();
  const logger = new RecordingLogger();
  const collector = options.collector ?? new StubVcsCollector();

  await store.syncRepositories({
    discovered: Array.from({ length: options.repositories ?? 1 }, (_unused, index) =>
      DiscoveredRepositoryBuilder.create()
        .withEntityRef(`component:default/repo-${index}`)
        .build(),
    ),
    retentionDays: 365,
    now: NOW,
  });

  const collectors: ReadonlyMap<Platform, VcsCollector> = new Map([["github", collector]]);
  const identities = new RecordingIdentityObserver();
  const command = new CaptureRepositorySnapshots({
    store,
    collectors,
    sonar: options.sonar ?? null,
    wakaTime: options.wakaTime ?? null,
    wakaTimeWindow: options.wakaTimeWindow ?? { historyDays: 30, aiDays: 0 },
    jira: options.jira ?? null,
    confluence: options.confluence ?? null,
    identities,
    settings: settings(options.overrides),
    logger,
  });

  return { command, store, collector, logger, identities };
};

describe("CaptureRepositorySnapshots", () => {
  it("should store a snapshot for each repository under today's date", async () => {
    // given
    const { command, store } = await createCommand({ repositories: 2 });

    // when
    const result = await command.run({ now: NOW });

    // then
    expect(result.captured).toBe(2);
    const snapshots = await store.listLatestSnapshots({ day: "2026-08-10" });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].day).toBe("2026-08-10");
  });

  it("should carry the provider payload into the stored snapshot", async () => {
    // given
    const collector = new StubVcsCollector().withSnapshot({
      primaryLanguage: "Go",
      defaultBranch: "trunk",
      branches: ["trunk", "release"],
    });
    const { command, store } = await createCommand({ collector });

    // when
    await command.run({ now: NOW });

    // then
    const [snapshot] = await store.listLatestSnapshots({ day: "2026-08-10" });
    expect(snapshot.payload).toMatchObject({
      primaryLanguage: "Go",
      defaultBranch: "trunk",
      branches: ["trunk", "release"],
    });
  });

  it("should share one project cache across the whole pass", async () => {
    // given
    // Azure DevOps branch policies are configured per project. Fetching them
    // once per repository — which is what the previous design did — meant forty
    // repositories in a project downloaded one identical payload forty times.
    const collector = new StubVcsCollector();
    const { command } = await createCommand({ repositories: 3, collector });

    // when
    await command.run({ now: NOW });

    // then
    expect(collector.snapshots).toHaveLength(3);
  });

  it("should attach Sonar measures when the enricher supplies them", async () => {
    // given
    const metrics: SonarMetrics = {
      bugs: 1,
      codeSmells: 2,
      securityHotspots: 3,
      vulnerabilities: 4,
      coverage: 87.5,
      duplications: 1.2,
      technicalDebt: "3h",
      technicalDebtMinutes: 180,
      qualityGateStatus: "OK",
    };
    const sonar = new StubSonarEnricher(metrics);
    const { command, store } = await createCommand({ sonar });

    // when
    await command.run({ now: NOW });

    // then
    const [snapshot] = await store.listLatestSnapshots({ day: "2026-08-10" });
    expect(snapshot.payload.sonarMetrics).toEqual(metrics);
  });

  it("should leave Sonar measures unset when no enricher is configured", async () => {
    // given
    const { command, store } = await createCommand({ sonar: null });

    // when
    await command.run({ now: NOW });

    // then
    const [snapshot] = await store.listLatestSnapshots({ day: "2026-08-10" });
    expect(snapshot.payload.sonarMetrics).toBeNull();
  });

  it("should fetch WakaTime once for the whole pass rather than per repository", async () => {
    // given
    // WakaTime reports per member for the organisation, so asking per
    // repository would multiply one answer by the repository count.
    const monday = WakaTimeMetricsBuilder.aDay("2026-08-10").withSeconds(3600).build();
    const wakaTime = new StubWakaTimeEnricher(
      new Map([["2026-08-10", new Map([["dev@example.com", monday]])]]),
    );
    const { command, store } = await createCommand({ repositories: 4, wakaTime });

    // when
    await command.run({ now: NOW });

    // then
    expect(wakaTime.callCount).toBe(1);
    const rows = await store.listContributorMetrics<WakaTimeMetrics>({
      source: "wakatime",
      from: "2026-08-10",
      to: "2026-08-10",
    });
    expect(rows).toEqual([
      { day: "2026-08-10", contributorKey: "dev@example.com", payload: monday },
    ]);
  });

  it("should ask for the whole configured history, not only today", async () => {
    // given
    // The summaries resource answers for an arbitrary span in one request per
    // member, so asking for a month costs exactly what asking for a day costs.
    const wakaTime = new StubWakaTimeEnricher();
    const { command } = await createCommand({
      wakaTime,
      wakaTimeWindow: { historyDays: 7, aiDays: 0 },
    });

    // when
    await command.run({ now: NOW });

    // then
    expect(wakaTime.lastRequest).toEqual({
      from: "2026-08-04",
      to: "2026-08-10",
      aiDays: [],
    });
  });

  it("should ask for AI figures only on the most recent days", async () => {
    // given
    // The durations resource takes a single date, so a month of AI history
    // would cost thirty times what the coding time costs.
    const wakaTime = new StubWakaTimeEnricher();
    const { command } = await createCommand({
      wakaTime,
      wakaTimeWindow: { historyDays: 30, aiDays: 2 },
    });

    // when
    await command.run({ now: NOW });

    // then
    expect(wakaTime.lastRequest?.aiDays).toEqual(["2026-08-09", "2026-08-10"]);
  });

  it("should record the accounts WakaTime reported even when they logged nothing", async () => {
    // given
    // An account that coded nothing all month is still an account somebody may
    // need to link, and the Identities screen is where they would look for it.
    const wakaTime = new StubWakaTimeEnricher(new Map(), [
      {
        source: "wakatime",
        sourceKey: "quiet",
        displayName: "Quiet Dev",
        email: null,
        avatarUrl: null,
        profileUrl: null,
      },
    ]);
    const { command, identities } = await createCommand({ wakaTime });

    // when
    await command.run({ now: NOW });

    // then
    expect(identities.keys()).toEqual(["wakatime:quiet"]);
  });

  it("should carry on when WakaTime is unreachable", async () => {
    // given
    // A time-tracking outage must not cost the day's compliance and quality
    // snapshot, which is the part the dashboard cannot reconstruct later.
    const wakaTime = new StubWakaTimeEnricher().withFailure(new Error("wakatime down"));
    const { command, logger } = await createCommand({ wakaTime });

    // when
    const result = await command.run({ now: NOW });

    // then
    expect(result.captured).toBe(1);
    expect(logger.at("warn").join(" ")).toContain("WakaTime enrichment failed");
  });

  it("should record the facts the snapshot learnt about the repository", async () => {
    // given
    const collector = new StubVcsCollector().withFacts({
      defaultBranch: "trunk",
      externalId: "guid-9",
      archived: true,
    });
    const { command, store } = await createCommand({ collector });

    // when
    await command.run({ now: NOW });

    // then
    const [tracked] = await store.listTrackedRepositories();
    expect(tracked.repository).toMatchObject({ defaultBranch: "trunk", archived: true });
  });

  it("should store the dated events a snapshot discovered", async () => {
    // given
    const collector = new StubVcsCollector().withSnapshotEvents([
      {
        repositoryId: "unset",
        kind: "release",
        externalId: "v1.2.0",
        occurredAt: new Date("2026-08-09T10:00:00.000Z"),
        actorKey: null,
        actorName: null,
        actorAvatarUrl: null,
        outcome: null,
        additions: null,
        deletions: null,
        changedFiles: null,
        payload: { tagName: "v1.2.0" },
      },
    ]);
    const { command, store } = await createCommand({ collector });

    // when
    await command.run({ now: NOW });

    // then
    const events = await store.listEvents({
      from: new Date("2026-08-09T00:00:00.000Z"),
      to: new Date("2026-08-10T00:00:00.000Z"),
      kinds: ["release"],
    });
    expect(events).toHaveLength(1);
  });

  it("should not claim a fetched day for the events a snapshot discovered", async () => {
    // given
    // Neither provider can list releases or tags by date, so recording a day as
    // covered for them would state something that was never established.
    const collector = new StubVcsCollector().withSnapshotEvents([
      {
        repositoryId: "unset",
        kind: "release",
        externalId: "v1.2.0",
        occurredAt: new Date("2026-08-09T10:00:00.000Z"),
        actorKey: null,
        actorName: null,
        actorAvatarUrl: null,
        outcome: null,
        additions: null,
        deletions: null,
        changedFiles: null,
        payload: null,
      },
    ]);
    const { command, store } = await createCommand({ collector });

    // when
    await command.run({ now: NOW });

    // then
    const coverage = await store.getCoverage();
    expect(coverage.earliestDay).toBeNull();
  });

  it("should overwrite a snapshot taken twice on the same day", async () => {
    // given
    const collector = new StubVcsCollector().withSnapshot({ primaryLanguage: "Go" });
    const { command, store } = await createCommand({ collector });
    await command.run({ now: NOW });

    // when
    collector.withSnapshot({ primaryLanguage: "Rust" });
    await command.run({ now: new Date("2026-08-10T04:00:00.000Z") });

    // then
    const snapshots = await store.listLatestSnapshots({ day: "2026-08-10" });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].payload.primaryLanguage).toBe("Rust");
  });

  it("should carry on past a repository that failed", async () => {
    // given
    const collector = new StubVcsCollector().withFailureFor(
      "component:default/repo-0",
      new Error("boom"),
    );
    const { command, logger } = await createCommand({ repositories: 3, collector });

    // when
    const result = await command.run({ now: NOW });

    // then
    expect(result.captured).toBe(2);
    expect(result.failures).toBe(1);
    expect(logger.at("warn").join(" ")).toContain("snapshot failed");
  });

  it("should skip the rest of a host in cooldown", async () => {
    // given
    const collector = new StubVcsCollector();
    const { command, store } = await createCommand({ repositories: 3, collector });
    for (const entry of await store.listTrackedRepositories()) {
      collector.withFailureFor(entry.repository.entityRef, new CircuitOpenError("github.com", 0));
    }

    // when
    const result = await command.run({ now: NOW });

    // then
    expect(result.failures).toBe(0);
    expect(result.skippedHosts).toEqual(["github.com"]);
  });

  it("should stop when the allowance runs out", async () => {
    // given
    const collector = new StubVcsCollector().withRequestCost(2);
    const { command } = await createCommand({
      repositories: 5,
      collector,
      overrides: { requestBudgetPerRun: 5 },
    });

    // when
    const result = await command.run({ now: NOW });

    // then
    expect(result.captured).toBeLessThan(5);
    expect(result.budgetExhausted).toBe(true);
  });

  it("should stop when the scheduled task is aborted", async () => {
    // given
    const controller = new AbortController();
    controller.abort();
    const { command, collector } = await createCommand({ repositories: 3 });

    // when
    const result = await command.run({ now: NOW, signal: controller.signal });

    // then
    expect(collector.snapshots).toEqual([]);
    expect(result.captured).toBe(0);
  });

  it("should report a platform with no registered collector", async () => {
    // given
    const store = new InMemoryCodeHealthStore();
    const logger = new RecordingLogger();
    await store.syncRepositories({
      discovered: [
        DiscoveredRepositoryBuilder.create().asAzureDevOps("example-org", "platform").build(),
      ],
      retentionDays: 365,
      now: NOW,
    });
    const command = new CaptureRepositorySnapshots({
      store,
      collectors: new Map(),
      sonar: null,
      wakaTime: null,
      wakaTimeWindow: { historyDays: 30, aiDays: 0 },
      jira: null,
      confluence: null,
      identities: new RecordingIdentityObserver(),
      settings: settings(),
      logger,
    });

    // when
    const result = await command.run({ now: NOW });

    // then
    expect(result.failures).toBe(1);
    expect(logger.at("warn").join(" ")).toContain("no collector is registered");
  });
});
