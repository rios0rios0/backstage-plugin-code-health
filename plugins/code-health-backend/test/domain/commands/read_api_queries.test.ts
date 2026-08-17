import { GetRepositoryTimeSeries } from "../../../src/domain/commands/get_repository_time_series";
import { ListContributorSummaries } from "../../../src/domain/commands/list_contributor_summaries";
import { ListRepositorySummaries } from "../../../src/domain/commands/list_repository_summaries";
import type { RepositorySnapshotPayload } from "../../../src/domain/entities/repository_snapshot";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { EventBuilder } from "../../builders/event_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { StubCatalogReader } from "../../doubles/stub_catalog_reader";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const WINDOW = {
  from: new Date("2026-08-09T00:00:00.000Z"),
  to: new Date("2026-08-11T00:00:00.000Z"),
};

const aSnapshotPayload = (
  overrides: Partial<RepositorySnapshotPayload> = {},
): RepositorySnapshotPayload => ({
  description: "the gateway",
  primaryLanguage: "Go",
  visibility: "PUBLIC",
  isArchived: false,
  isFork: false,
  defaultBranch: "main",
  updatedAt: "2026-08-10T02:00:00.000Z",
  ciStatus: null,
  latestRelease: null,
  latestTag: null,
  branches: ["main"],
  complianceStatus: null,
  badgeStatus: null,
  sonarMetrics: null,
  wakaTimeMetrics: null,
  ...overrides,
});

const seed = async (repositories = 1) => {
  const store = new InMemoryCodeHealthStore();
  const discovered = Array.from({ length: repositories }, (_unused, index) =>
    DiscoveredRepositoryBuilder.create()
      .withEntityRef(`component:default/repo-${index}`)
      .withName(`repo-${index}`)
      .build(),
  );
  await store.syncRepositories({ discovered, retentionDays: 365, now: NOW });
  return { store, discovered };
};

const commit = (repositoryId: string, at: string, actor = "dev@example.com") =>
  EventBuilder.commit().withRepository(repositoryId).withActor(actor).at(at).withChurn(10, 2, 1);

describe("ListRepositorySummaries", () => {
  it("should render a repository with the counters from its window", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        commit(repository.id, "2026-08-09T10:00:00.000Z").build(),
        commit(repository.id, "2026-08-10T10:00:00.000Z").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [summary] = await new ListRepositorySummaries(store).run(WINDOW);

    // then
    expect(summary.activity.commits).toBe(2);
    expect(summary.activity.additions).toBe(20);
    expect(summary.name).toBe("repo-0");
  });

  it("should render a repository that has no snapshot yet", async () => {
    // given
    // Ingestion runs every few minutes and the snapshot task runs daily, so a
    // freshly discovered repository has activity before it has state. Hiding it
    // would make the dashboard look as though discovery had not worked.
    const { store } = await seed();

    // when
    const [summary] = await new ListRepositorySummaries(store).run(WINDOW);

    // then
    expect(summary.complianceStatus).toBeNull();
    expect(summary.activity.commits).toBe(0);
  });

  it("should use the snapshot as it was at the end of the window", async () => {
    // given
    // Asking about a past period has to render the repository as it was then;
    // showing today's state against last month's numbers would be a lie the
    // user has no way to notice.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.saveSnapshot({
      repositoryId: repository.id,
      day: "2026-08-09",
      capturedAt: NOW,
      payload: aSnapshotPayload({ primaryLanguage: "Go" }),
    });
    await store.saveSnapshot({
      repositoryId: repository.id,
      day: "2026-08-20",
      capturedAt: NOW,
      payload: aSnapshotPayload({ primaryLanguage: "Rust" }),
    });

    // when
    const [summary] = await new ListRepositorySummaries(store).run(WINDOW);

    // then
    expect(summary.primaryLanguage).toBe("Go");
  });

  it("should keep each repository's events to itself", async () => {
    // given
    const { store, discovered } = await seed(2);
    await store.commitIngestion({
      repositoryId: discovered[0].id,
      events: [commit(discovered[0].id, "2026-08-09T10:00:00.000Z").build()],
      chunk: { repositoryId: discovered[0].id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const summaries = await new ListRepositorySummaries(store).run(WINDOW);

    // then
    const byName = new Map(summaries.map((summary) => [summary.name, summary]));
    expect(byName.get("repo-0")?.activity.commits).toBe(1);
    expect(byName.get("repo-1")?.activity.commits).toBe(0);
  });

  it("should render the full name with the project level on Azure DevOps", async () => {
    // given
    const store = new InMemoryCodeHealthStore();
    await store.syncRepositories({
      discovered: [
        DiscoveredRepositoryBuilder.create()
          .withName("gateway")
          .asAzureDevOps("example-org", "platform")
          .build(),
      ],
      retentionDays: 365,
      now: NOW,
    });

    // when
    const [summary] = await new ListRepositorySummaries(store).run(WINDOW);

    // then
    expect(summary.fullName).toBe("example-org/platform/gateway");
  });
});

describe("ListContributorSummaries", () => {
  it("should group a window's events by contributor", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        commit(repository.id, "2026-08-09T10:00:00.000Z", "dev@example.com").build(),
        commit(repository.id, "2026-08-09T11:00:00.000Z", "dev@example.com").build(),
        commit(repository.id, "2026-08-09T12:00:00.000Z", "other@example.com").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const contributors = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributors).toHaveLength(2);
    expect(contributors[0]).toMatchObject({ key: "dev@example.com", commits: 2 });
  });

  it("should aggregate the Sonar metrics of the repositories a contributor touched", async () => {
    // given
    // Sonar measures projects, not people, so a contributor row can only report
    // the health of the code they worked on. One contributor, two repositories.
    const { store, discovered } = await seed(2);
    const metrics = [
      { bugs: 3, codeSmells: 10, securityHotspots: 1, vulnerabilities: 2, coverage: 80, duplications: 2, technicalDebt: "1h", technicalDebtMinutes: 60, qualityGateStatus: "OK" as const },
      { bugs: 4, codeSmells: 5, securityHotspots: 2, vulnerabilities: 0, coverage: 60, duplications: 4, technicalDebt: "2h", technicalDebtMinutes: 120, qualityGateStatus: "ERROR" as const },
    ];
    for (const [index, repository] of discovered.entries()) {
      await store.saveSnapshot({
        repositoryId: repository.id,
        day: "2026-08-10",
        capturedAt: NOW,
        payload: aSnapshotPayload({ sonarMetrics: metrics[index] }),
      });
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
        chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
        status: "active",
        now: NOW,
      });
    }

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor?.sonarMetrics).toEqual({
      // counts sum: someone spanning two repositories carries both
      bugs: 7,
      codeSmells: 15,
      securityHotspots: 3,
      vulnerabilities: 2,
      // percentages average: adding two coverage figures is meaningless
      coverage: 70,
      duplications: 3,
      // debt sums, which is why the raw minutes travel with the formatted string
      technicalDebt: "3h",
      technicalDebtMinutes: 180,
      // worst wins, so one failing repository stays visible
      qualityGateStatus: "ERROR",
    });
  });

  it("should report no Sonar metrics when the contributor's repositories have none", async () => {
    // given
    // The annotation is optional, so most repositories have no Sonar project and
    // a row of zeroes would read as a clean bill of health rather than no data.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.saveSnapshot({
      repositoryId: repository.id,
      day: "2026-08-10",
      capturedAt: NOW,
      payload: aSnapshotPayload({ sonarMetrics: null }),
    });
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor?.sonarMetrics).toBeNull();
  });

  it("should resolve a contributor to the catalog user with the same e-mail", async () => {
    // given
    // The catalog is the organisation's record of who someone is, so its display
    // name and picture win over whatever the provider attached to the commit.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [commit(repository.id, "2026-08-09T10:00:00.000Z", "Dev@Example.com").build()],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });
    const catalog = new StubCatalogReader().withUsers({
      "dev@example.com": {
        entityRef: "user:default/dev_example.com",
        displayName: "Dev Eloper",
        picture: "https://example.com/dev.png",
      },
    });

    // when
    const [contributor] = await new ListContributorSummaries(store, catalog).run(WINDOW);

    // then
    expect(contributor).toMatchObject({
      entityRef: "user:default/dev_example.com",
      displayName: "Dev Eloper",
      avatarUrl: "https://example.com/dev.png",
    });
  });

  it("should leave a contributor unlinked when no catalog user matches", async () => {
    // given
    // Bots, service accounts and commits from a personal address have no entity.
    // Guessing one by display name would silently merge two different people.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [commit(repository.id, "2026-08-09T10:00:00.000Z", "bot@ci.local").build()],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });
    const catalog = new StubCatalogReader().withUsers({});

    // when
    const [contributor] = await new ListContributorSummaries(store, catalog).run(WINDOW);

    // then
    expect(contributor?.entityRef).toBeNull();
    expect(contributor?.key).toBe("bot@ci.local");
    // The display name falls back to what the provider reported on the commit,
    // which is the only name available for an identity the catalog does not know.
    expect(contributor?.displayName).toBe("Dev Example");
  });

  it("should look up only the contributors present in the window", async () => {
    // given
    // The directory is routinely thousands of entities and this runs on every
    // dashboard load, so the query must be bounded by who actually committed.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        commit(repository.id, "2026-08-09T10:00:00.000Z", "one@example.com").build(),
        commit(repository.id, "2026-08-09T11:00:00.000Z", "two@example.com").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });
    const catalog = new StubCatalogReader().withUsers({});

    // when
    await new ListContributorSummaries(store, catalog).run(WINDOW);

    // then
    expect(catalog.emailLookups).toHaveLength(1);
    expect([...catalog.emailLookups[0]].sort()).toEqual(["one@example.com", "two@example.com"]);
  });

  it("should sort the busiest contributor first", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        commit(repository.id, "2026-08-09T10:00:00.000Z", "quiet@example.com").build(),
        commit(repository.id, "2026-08-09T11:00:00.000Z", "busy@example.com").build(),
        commit(repository.id, "2026-08-09T12:00:00.000Z", "busy@example.com").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const contributors = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributors.map((contributor) => contributor.key)).toEqual([
      "busy@example.com",
      "quiet@example.com",
    ]);
  });

  it("should compute an approval rate from the reviews given", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.review("approved").withRepository(repository.id).withActor("r@example.com").at("2026-08-09T10:00:00.000Z").build(),
        EventBuilder.review("approved").withRepository(repository.id).withActor("r@example.com").at("2026-08-09T11:00:00.000Z").build(),
        EventBuilder.review("rejected").withRepository(repository.id).withActor("r@example.com").at("2026-08-09T12:00:00.000Z").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["pr_review"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor).toMatchObject({
      reviewsGiven: 3,
      reviewsApproved: 2,
      reviewsRejected: 1,
      prApprovalRate: 66.7,
    });
  });

  it("should compute a pipeline success rate", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.build("succeeded").withRepository(repository.id).withActor("d@example.com").at("2026-08-09T10:00:00.000Z").build(),
        EventBuilder.build("failed").withRepository(repository.id).withActor("d@example.com").at("2026-08-09T11:00:00.000Z").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["build"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor.pipelineSuccessRate).toBe(50);
  });

  it("should floor net lines at zero", async () => {
    // given
    // A window in which someone mostly deleted code is a legitimate
    // contribution, not a negative one.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.commit()
          .withRepository(repository.id)
          .withActor("d@example.com")
          .at("2026-08-09T10:00:00.000Z")
          .withChurn(5, 500)
          .build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor.linesOfCode).toBe(0);
    expect(contributor.linesDeleted).toBe(500);
  });

  it("should narrow to one repository when asked", async () => {
    // given
    const { store, discovered } = await seed(2);
    for (const repository of discovered) {
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
        chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
        status: "active",
        now: NOW,
      });
    }

    // when
    const contributors = await new ListContributorSummaries(store).run({
      ...WINDOW,
      repositoryId: discovered[0].id,
    });

    // then
    expect(contributors[0].commits).toBe(1);
    expect(contributors[0].repositories).toBe(1);
  });

  it("should attach WakaTime measures on the shared contributor key", async () => {
    // given
    // Both sides normalise the identity the same way, which is what lets the
    // join happen without an identity mapping table.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [commit(repository.id, "2026-08-09T10:00:00.000Z", "dev@example.com").build()],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });
    await store.saveContributorMetrics({
      day: "2026-08-10",
      capturedAt: NOW,
      metrics: new Map([["dev@example.com", { totalSeconds: 3600, dailyAverageSeconds: 120 }]]),
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor.wakaTimeMetrics).toEqual({
      totalSeconds: 3600,
      dailyAverageSeconds: 120,
    });
  });

  it("should count the pull requests a contributor opened and merged", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.pullRequest("open").withRepository(repository.id).withActor("d@example.com").at("2026-08-09T10:00:00.000Z").build(),
        EventBuilder.pullRequest("merged").withRepository(repository.id).withActor("d@example.com").at("2026-08-09T11:00:00.000Z").build(),
        EventBuilder.pullRequest("abandoned").withRepository(repository.id).withActor("d@example.com").at("2026-08-09T12:00:00.000Z").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: ["pull_request"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    // An abandoned pull request counts towards neither, so neither number is
    // inflated by work that was thrown away.
    expect(contributor).toMatchObject({ pullRequestsOpened: 1, pullRequestsMerged: 1 });
  });

  it("should ignore a kind that carries no contributor meaning", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.release().withRepository(repository.id).withActor("d@example.com").at("2026-08-09T10:00:00.000Z").build(),
      ],
      chunk: { repositoryId: repository.id, kinds: [], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    // The release still names them as a contributor to the window, but it is
    // not a commit, a review or a pipeline run.
    expect(contributor).toMatchObject({ commits: 0, reviewsGiven: 0, pipelineRuns: 0 });
    expect(contributor.repositories).toBe(1);
  });

  it("should take the display name and avatar from the events", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        {
          ...commit(repository.id, "2026-08-09T10:00:00.000Z", "d@example.com").build(),
          actorName: "Dev Example",
          actorAvatarUrl: "https://avatar",
        },
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const [contributor] = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributor.displayName).toBe("Dev Example");
    expect(contributor.avatarUrl).toBe("https://avatar");
  });

  it("should ignore events with no actor", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.release()
          .withRepository(repository.id)
          .withActor(null)
          .at("2026-08-09T10:00:00.000Z")
          .build(),
      ],
      chunk: { repositoryId: repository.id, kinds: [], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const contributors = await new ListContributorSummaries(store).run(WINDOW);

    // then
    expect(contributors).toEqual([]);
  });
});

describe("GetRepositoryTimeSeries", () => {
  it("should emit a point for every day, including empty ones", async () => {
    // given
    // Closing over a gap would draw a line implying activity that never
    // happened.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const points = await new GetRepositoryTimeSeries(store).run({
      repositoryId: repository.id,
      ...WINDOW,
      bucket: "day",
    });

    // then
    expect(points.map((point) => point.day)).toEqual(["2026-08-09", "2026-08-10"]);
    expect(points[0].activity.commits).toBe(1);
    expect(points[1].activity.commits).toBe(0);
  });

  it("should group a week onto its Monday", async () => {
    // given
    // 2026-08-09 is a Sunday, which belongs to the week that started six days
    // earlier rather than to the one beginning the next morning.
    const { store, discovered } = await seed();
    const [repository] = discovered;
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    const points = await new GetRepositoryTimeSeries(store).run({
      repositoryId: repository.id,
      from: new Date("2026-08-09T00:00:00.000Z"),
      to: new Date("2026-08-10T00:00:00.000Z"),
      bucket: "week",
    });

    // then
    expect(points.map((point) => point.day)).toEqual(["2026-08-03"]);
  });

  it("should group a month onto its first day", async () => {
    // given
    const { store, discovered } = await seed();
    const [repository] = discovered;

    // when
    const points = await new GetRepositoryTimeSeries(store).run({
      repositoryId: repository.id,
      from: new Date("2026-08-09T00:00:00.000Z"),
      to: new Date("2026-08-11T00:00:00.000Z"),
      bucket: "month",
    });

    // then
    expect(points.map((point) => point.day)).toEqual(["2026-08-01"]);
  });

  it("should aggregate every repository when none is named", async () => {
    // given
    // The Insights tab charts the whole fleet as one series; asking per
    // repository and adding the answers up in the browser would mean one
    // request per repository on every range change.
    const { store, discovered } = await seed(2);
    for (const repository of discovered) {
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: [],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });
    }

    // when
    const points = await new GetRepositoryTimeSeries(store).run({
      ...WINDOW,
      bucket: "day",
    });

    // then
    expect(points.map((point) => point.day)).toEqual(["2026-08-09", "2026-08-10"]);
    expect(points[0].activity.commits).toBe(2);
  });

  it("should still scope to one repository when it is named", async () => {
    // given
    const { store, discovered } = await seed(2);
    for (const repository of discovered) {
      await store.commitIngestion({
        repositoryId: repository.id,
        events: [commit(repository.id, "2026-08-09T10:00:00.000Z").build()],
        chunk: {
          repositoryId: repository.id,
          kinds: ["commit"],
          days: [],
          ingestedAt: NOW,
        },
        status: "active",
        now: NOW,
      });
    }

    // when
    const points = await new GetRepositoryTimeSeries(store).run({
      repositoryId: discovered[0].id,
      ...WINDOW,
      bucket: "day",
    });

    // then
    expect(points[0].activity.commits).toBe(1);
  });
});
