import type { AtlassianSettings } from "../../../../src/domain/entities/ingestion_settings";
import type { JiraSettings } from "../../../../src/domain/entities/jira_settings";
import {
  DEFAULT_JIRA_HISTORY_DAYS,
  DEFAULT_JIRA_SETTINGS,
  jiraSettingsFrom,
} from "../../../../src/domain/entities/jira_settings";
import { RequestBudget } from "../../../../src/domain/entities/request_budget";
import {
  EMPTY_CATALOG_FACTS,
  type TrackedRepository,
} from "../../../../src/domain/entities/tracked_repository";
import type { ObservedIdentity } from "../../../../src/domain/services/identity_resolver";
import { ProviderGateway } from "../../../../src/infrastructure/http/provider_gateway";
import { AtlassianClient } from "../../../../src/infrastructure/services/atlassian/atlassian_client";
import { JiraApiEnricher } from "../../../../src/infrastructure/services/atlassian/jira_enricher";
import { aTrackedRepository } from "../../../builders/tracked_repository_builder";
import { JiraIssueBuilder, STATUS_IDS, statusDescriptors } from "../../../builders/jira_issue_builder";
import { ControlledClock } from "../../../doubles/controlled_clock";
import { RecordingLogger } from "../../../doubles/recording_logger";
import { TestProviderServer } from "../../../doubles/test_provider_server";

const server = new TestProviderServer();

/** Fixed so the window a run derives from the day is the same in every test. */
const NOW = new Date("2026-08-08T12:00:00.000Z");

const STORY_POINTS_FIELD = "customfield_10016";

beforeAll(async () => server.start());
afterAll(async () => server.stop());
beforeEach(() => server.reset());

/**
 * Records what a source said it saw.
 *
 * Observation is a fire-and-forget side effect with nothing else to assert on,
 * which is the one case the testing standard allows a recording double for.
 */
class RecordingIdentityObserver {
  readonly observed: ObservedIdentity[] = [];
  failWith: Error | null = null;

  async observe(identities: readonly ObservedIdentity[]): Promise<void> {
    if (this.failWith !== null) throw this.failWith;
    this.observed.push(...identities);
  }
}

const aJiraRepository = (
  overrides: { id?: string; projectKey?: string | null; component?: string | null } = {},
): TrackedRepository =>
  aTrackedRepository({
    ...(overrides.id === undefined ? {} : { id: overrides.id }),
    catalogFacts: {
      ...EMPTY_CATALOG_FACTS,
      jiraProjectKey: overrides.projectKey === undefined ? "PLAT" : overrides.projectKey,
      jiraComponent: overrides.component ?? null,
    },
  });

const createEnricher = (options: {
  repositories?: readonly TrackedRepository[];
  settings?: Partial<JiraSettings>;
  budget?: number;
  baseUrl?: string | null;
  /** Omitted to exercise the wall clock the plugin uses in production. */
  now?: (() => Date) | null;
} = {}) => {
  const logger = new RecordingLogger();
  const identities = new RecordingIdentityObserver();
  const atlassian: AtlassianSettings = {
    baseUrl: server.baseUrl,
    email: "bot@example.com",
    apiToken: "fixture-token-placeholder",
    maxResultsPerRun: 2000,
    historyDays: 7,
    jira: { enabled: true, storyPointsField: null },
    confluence: { enabled: false, spaceKeys: [] },
  };

  const enricher = new JiraApiEnricher({
    client: new AtlassianClient({
      gateway: new ProviderGateway({
        logger,
        concurrencyPerHost: 4,
        clock: new ControlledClock(1_000_000),
      }),
      settings: atlassian,
      logger,
    }),
    settings: {
      ...DEFAULT_JIRA_SETTINGS,
      enabled: true,
      historyDays: 7,
      ...options.settings,
    },
    baseUrl: options.baseUrl === undefined ? server.baseUrl : options.baseUrl,
    listRepositories: async () => options.repositories ?? [aJiraRepository()],
    identities,
    logger,
    ...(options.now === null ? {} : { now: options.now ?? (() => NOW) }),
  });

  return {
    enricher,
    logger,
    identities,
    context: { budget: new RequestBudget(options.budget ?? 200) },
  };
};

/** Answers the three site-wide lookups every run makes. */
const withSiteMetadata = (priorities: readonly string[] = ["Highest", "Medium"]) =>
  server
    .onPath("/rest/api/3/field", () => ({
      body: [
        { id: "customfield_10001", name: "Sprint" },
        { id: STORY_POINTS_FIELD, name: "Story Points" },
      ],
    }))
    .onPath("/rest/api/3/status", () => ({ body: statusDescriptors() }))
    .onPath("/rest/api/3/priority", () => ({
      body: priorities.map((name, index) => ({ id: `${index}`, name })),
    }));

const withSearch = (issues: readonly unknown[]) =>
  server.on("/search/jql", (request) => {
    const body = JSON.parse(request.body) as { jql: string; maxResults?: number };
    // The backlog queries ask for the oldest open issue only, and answering
    // them with the activity page would make every project look identical.
    if (body.jql.includes("statusCategory != Done")) {
      return { body: { issues: [], isLast: true } };
    }
    return { body: { issues, isLast: true } };
  });

const withCounts = (count: number) =>
  server.on("/approximate-count", () => ({ body: { count } }));

const aResolvedIssue = (key: string, accountId: string) =>
  JiraIssueBuilder.create()
    .withKey(key)
    .withType("Bug")
    .withReporter(JiraIssueBuilder.account("REPORTER-1", { emailAddress: "pm@example.com" }))
    .withAssignee(JiraIssueBuilder.account(accountId))
    .withCreated("2026-08-03T09:00:00.000Z")
    .withResolution("2026-08-05T09:00:00.000Z")
    .withStoryPoints(STORY_POINTS_FIELD, 5)
    .withTransition({
      accountId,
      at: "2026-08-04T09:00:00.000Z",
      from: STATUS_IDS.todo,
      to: STATUS_IDS.inProgress,
    })
    .withComments([{ accountId, created: "2026-08-04T10:00:00.000Z" }])
    .withWorklog([{ accountId, started: "2026-08-04T11:00:00.000Z" }])
    .build();

describe("JiraApiEnricher", () => {
  describe("contributors", () => {
    it("should measure a person's delivery from one scan of their project", async () => {
      // given
      withSiteMetadata();
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      withCounts(4);
      const { enricher, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.get("dev-1")).toMatchObject({
        window: { from: "2026-08-02T00:00:00.000Z", to: "2026-08-09T00:00:00.000Z" },
        issuesResolved: 1,
        storyPointsCompleted: 5,
        cycleTime: { totalHours: 24, issues: 1 },
        leadTime: { totalHours: 48, issues: 1 },
        interactions: { comments: 1, worklogEntries: 1, transitions: 1, truncatedIssues: 0 },
        reopened: 0,
      });
      expect(contributors.get("reporter-1")?.issuesCreated).toBe(1);
    });

    it("should ask the site for its story-point field only when it is not pinned", async () => {
      // given
      // Pinning is the escape hatch for a site carrying both the
      // company-managed and the team-managed field.
      withSiteMetadata();
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      withCounts(0);
      const { enricher, context } = createEnricher({
        settings: { storyPointsField: STORY_POINTS_FIELD },
      });

      // when
      await enricher.fetchContributors(context);

      // then
      expect(server.requestsFor("/rest/api/3/field")).toHaveLength(0);
    });

    it("should report story points as unmeasured when the site has no such field", async () => {
      // given
      // Guessing a field would produce a column of zeroes that reads as a team
      // estimating nothing.
      server
        .onPath("/rest/api/3/field", () => ({ body: [{ id: "customfield_1", name: "Sprint" }] }))
        .onPath("/rest/api/3/status", () => ({ body: statusDescriptors() }));
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      const { enricher, logger, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.get("dev-1")?.storyPointsCompleted).toBeNull();
      expect(logger.at("info").join("\n")).toContain("storyPointsField");
    });

    it("should leave cycle time unmeasured when the site's statuses cannot be read", async () => {
      // given
      // The changelog reports status names, which any team can rename, so
      // without the category map there is no honest cycle time to report.
      server
        .onPath("/rest/api/3/field", () => ({ body: [] }))
        .onPath("/rest/api/3/status", () => ({ status: 403, body: { message: "no" } }));
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      const { enricher, logger, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.get("dev-1")?.cycleTime).toBeNull();
      // Lead time survives: it comes from fields the issue carries directly.
      expect(contributors.get("dev-1")?.leadTime).toEqual({ totalHours: 48, issues: 1 });
      expect(logger.at("warn").join("\n")).toContain("cycle time");
    });

    it("should walk every page the site offers", async () => {
      // given
      withSiteMetadata();
      server.on("/search/jql", (request) => {
        const body = JSON.parse(request.body) as { jql: string; nextPageToken?: string };
        if (body.jql.includes("statusCategory != Done")) {
          return { body: { issues: [], isLast: true } };
        }
        return body.nextPageToken === undefined
          ? {
              body: {
                issues: [aResolvedIssue("PLAT-1", "dev-1")],
                nextPageToken: "page-2",
                isLast: false,
              },
            }
          : { body: { issues: [aResolvedIssue("PLAT-2", "dev-2")], isLast: true } };
      });
      withCounts(0);
      const { enricher, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect([...contributors.keys()].sort()).toEqual(["dev-1", "dev-2", "reporter-1"]);
    });

    it("should measure nothing when no catalog entity names a Jira project", async () => {
      // given
      // Several repositories legitimately track no work in Jira, and guessing a
      // project for them would put somebody else's numbers on their row.
      const { enricher, context } = createEnricher({
        repositories: [aJiraRepository({ projectKey: null })],
      });

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.size).toBe(0);
      expect(server.requests).toHaveLength(0);
    });

    it("should measure nothing when the integration is switched off", async () => {
      // given
      const { enricher, context } = createEnricher({ settings: { enabled: false } });

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.size).toBe(0);
      expect(server.requests).toHaveLength(0);
    });

    it("should keep the projects it reached when one of them fails", async () => {
      // given
      withSiteMetadata();
      server.on("/search/jql", (request) => {
        const body = JSON.parse(request.body) as { jql: string };
        if (body.jql.includes("BROKEN")) return { status: 400, body: { message: "bad JQL" } };
        if (body.jql.includes("statusCategory != Done")) {
          return { body: { issues: [], isLast: true } };
        }
        return { body: { issues: [aResolvedIssue("PLAT-1", "dev-1")], isLast: true } };
      });
      withCounts(0);
      const { enricher, logger, context } = createEnricher({
        repositories: [
          aJiraRepository({ id: "good", projectKey: "PLAT" }),
          aJiraRepository({ id: "bad", projectKey: "BROKEN" }),
        ],
      });

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.get("dev-1")?.issuesResolved).toBe(1);
      expect(logger.at("warn").join("\n")).toContain("BROKEN");
    });

    it("should stop the scan and keep what it measured when the allowance runs out", async () => {
      // given
      // A spent budget is a normal outcome, not a fault: the run leaves the
      // projects it did not reach for the next one rather than retrying.
      withSiteMetadata([]);
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      const { enricher, logger, context } = createEnricher({ budget: 2 });

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.size).toBe(0);
      expect(logger.at("info").join("\n")).toContain("Jira scan stopped");
    });

    it("should carry on with story points unmeasured when the field list cannot be read", async () => {
      // given
      server
        .onPath("/rest/api/3/field", () => ({ status: 401, body: { message: "no" } }))
        .onPath("/rest/api/3/status", () => ({ body: statusDescriptors() }));
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      const { enricher, logger, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.get("dev-1")?.issuesResolved).toBe(1);
      expect(contributors.get("dev-1")?.storyPointsCompleted).toBeNull();
      expect(logger.at("warn").join("\n")).toContain("could not list Jira fields");
    });

    it("should measure a window of the configured length from the wall clock", async () => {
      // given
      // The window is derived from the day the run belongs to rather than the
      // instant each method was called, which is what lets the two port methods
      // share one scan.
      withSiteMetadata([]);
      withSearch([]);
      withCounts(0);
      const { enricher, context } = createEnricher({ now: null });

      // when
      const byDay = await enricher.fetchContributorsByDay(context);

      // then
      expect(byDay.size).toBe(0);
      expect(server.requestsFor("/search/jql")).toHaveLength(1);
    });

    it("should stop scanning as soon as the run is aborted", async () => {
      // given
      withSiteMetadata([]);
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      const controller = new AbortController();
      controller.abort();
      const { enricher, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors({
        ...context,
        signal: controller.signal,
      });

      // then
      expect(contributors.size).toBe(0);
      expect(server.requestsFor("/search/jql")).toHaveLength(0);
    });

    it("should skip a hit the site returned without a key", async () => {
      // given
      withSiteMetadata([]);
      withSearch([JiraIssueBuilder.create().withoutKey().build()]);
      withCounts(0);
      const { enricher, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.size).toBe(0);
    });

    it("should treat a page with no issues array as the end of the walk", async () => {
      // given
      withSiteMetadata([]);
      server.on("/search/jql", () => ({ body: {} }));
      withCounts(0);
      const { enricher, context } = createEnricher();

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.size).toBe(0);
    });

    it("should re-read the site's statuses only when the window moves on", async () => {
      // given
      // The three site-wide lookups are cached with the scan, so a second run
      // on the same day costs nothing and a run on the next day is fresh.
      withSiteMetadata([]);
      withSearch([]);
      withCounts(0);
      let today = NOW;
      const { enricher, context } = createEnricher({ now: () => today });

      // when
      await enricher.fetchContributors(context);
      today = new Date("2026-08-09T12:00:00.000Z");
      await enricher.fetchContributors(context);

      // then
      expect(server.requestsFor("/rest/api/3/status")).toHaveLength(1);
      expect(server.requestsFor("/search/jql")).toHaveLength(2);
    });

    it("should leave the profile link off when the site root is unknown", async () => {
      // given
      withSiteMetadata([]);
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      withCounts(0);
      const { enricher, identities, context } = createEnricher({ baseUrl: null });

      // when
      await enricher.fetchContributors(context);

      // then
      expect(identities.observed.every((identity) => identity.profileUrl === null)).toBe(true);
    });
  });

  describe("identities", () => {
    it("should record every account it saw, keyed by the Atlassian accountId", async () => {
      // given
      // The accountId is the only identifier GDPR-era Jira returns everywhere;
      // the e-mail arrives only when the person made it visible, and is
      // recorded purely so the linking screen has something to match on.
      withSiteMetadata();
      withSearch([aResolvedIssue("PLAT-1", "DEV-1")]);
      withCounts(0);
      const { enricher, identities, context } = createEnricher();

      // when
      await enricher.fetchContributors(context);

      // then
      const reporter = identities.observed.find(
        (identity) => identity.sourceKey === "reporter-1",
      );
      expect(reporter).toEqual({
        source: "jira",
        sourceKey: "reporter-1",
        displayName: "User REPORTER-1",
        email: "pm@example.com",
        avatarUrl: "https://avatar.example/REPORTER-1",
        // Built from the id Jira returned rather than from the folded key: the
        // key is ours, the identifier in the link is theirs.
        profileUrl: `${server.baseUrl}/jira/people/REPORTER-1`,
      });
      expect(identities.observed.map((identity) => identity.sourceKey)).toContain("dev-1");
    });

    it("should still report its measurements when the identity record fails", async () => {
      // given
      // Losing a row on an admin screen must not cost the day's measurements.
      withSiteMetadata();
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      withCounts(0);
      const { enricher, identities, logger, context } = createEnricher();
      identities.failWith = new Error("store is down");

      // when
      const contributors = await enricher.fetchContributors(context);

      // then
      expect(contributors.get("dev-1")?.issuesResolved).toBe(1);
      expect(logger.at("warn").join("\n")).toContain("could not record Jira identities");
    });
  });

  describe("repositories", () => {
    it("should hand one project's answer to every repository that names it", async () => {
      // given
      // Querying per repository downloads one identical payload once per
      // repository, which is the mistake Azure DevOps branch policies made.
      withSiteMetadata([]);
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      withCounts(11);
      const repositories = [
        aJiraRepository({ id: "one" }),
        aJiraRepository({ id: "two" }),
        aJiraRepository({ id: "three", projectKey: null }),
      ];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect([...metrics.keys()].sort()).toEqual(["one", "two"]);
      expect(metrics.get("one")).toBe(metrics.get("two"));
      expect(metrics.get("one")).toMatchObject({
        projectKey: "PLAT",
        issuesResolved: 1,
        bugRatio: 100,
        openIssues: 11,
        throughputPerWeek: 1,
      });
      // One activity query for the project, not one per repository.
      const activity = server
        .requestsFor("/search/jql")
        .filter((request) => !request.body.includes("statusCategory != Done"));
      expect(activity).toHaveLength(1);
    });

    it("should scan Jira once for both halves of a run", async () => {
      // given
      // The two port methods are called back to back on the same run and need
      // the same issues; scanning twice would double the most expensive thing
      // this plugin does.
      withSiteMetadata([]);
      withSearch([aResolvedIssue("PLAT-1", "dev-1")]);
      withCounts(0);
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      await enricher.fetchContributors(context);
      await enricher.fetchRepositories(repositories, context);

      // then
      expect(server.requestsFor("/rest/api/3/field")).toHaveLength(1);
      const activity = server
        .requestsFor("/search/jql")
        .filter((request) => !request.body.includes("statusCategory != Done"));
      expect(activity).toHaveLength(1);
    });

    it("should name the oldest unfinished issue", async () => {
      // given
      withSiteMetadata([]);
      server.on("/search/jql", (request) => {
        const body = JSON.parse(request.body) as { jql: string };
        return body.jql.includes("statusCategory != Done")
          ? {
              body: {
                issues: [
                  JiraIssueBuilder.create()
                    .withKey("PLAT-7")
                    .withCreated("2026-05-01T00:00:00.000Z")
                    .build(),
                ],
                isLast: true,
              },
            }
          : { body: { issues: [], isLast: true } };
      });
      withCounts(3);
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.oldestOpenIssue).toMatchObject({
        key: "PLAT-7",
        ageDays: 99,
      });
    });

    it("should count the backlog by priority, dropping the buckets nobody is in", async () => {
      // given
      withSiteMetadata(["Highest", "Medium"]);
      withSearch([]);
      server.on("/approximate-count", (request) => {
        const body = JSON.parse(request.body) as { jql: string };
        if (body.jql.includes('"Highest"')) return { body: { count: 2 } };
        if (body.jql.includes('"Medium"')) return { body: { count: 0 } };
        return { body: { count: 9 } };
      });
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.openByPriority).toEqual([{ name: "Highest", count: 2 }]);
      expect(metrics.get("one")?.openIssues).toBe(9);
    });

    it("should drop the priority breakdown when a site has too many priorities to chart", async () => {
      // given
      // It is also a cost ceiling: each bucket is its own count request, per
      // project.
      withSiteMetadata(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
      withSearch([]);
      withCounts(1);
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.openByPriority).toEqual([]);
    });

    it("should give up the priority breakdown before the measurements that need the allowance", async () => {
      // given
      // An empty breakdown renders as nothing at all, which is the correct
      // thing for a measurement that was not taken.
      withSiteMetadata(["Highest", "Medium", "Low"]);
      withSearch([]);
      withCounts(4);
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, logger, context } = createEnricher({ repositories, budget: 45 });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.openByPriority).toEqual([]);
      expect(metrics.get("one")?.openIssues).toBe(4);
      expect(logger.at("debug").join("\n")).toContain("priority breakdown");
    });

    it("should report the backlog as unmeasured when the site refuses to count it", async () => {
      // given
      withSiteMetadata([]);
      withSearch([]);
      server.on("/approximate-count", () => ({ status: 400, body: { message: "no" } }));
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.openIssues).toBeNull();
      expect(metrics.get("one")?.oldestOpenIssue).toBeNull();
    });

    it("should leave the priority breakdown empty when the site will not list its priorities", async () => {
      // given
      // Every other measurement on the row survives; only the breakdown that
      // needed the list is dropped.
      server
        .onPath("/rest/api/3/field", () => ({ body: [] }))
        .onPath("/rest/api/3/status", () => ({ body: statusDescriptors() }))
        .onPath("/rest/api/3/priority", () => ({ status: 403, body: { message: "no" } }));
      withSearch([]);
      withCounts(6);
      const repositories = [aJiraRepository({ id: "one" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.openByPriority).toEqual([]);
      expect(metrics.get("one")?.openIssues).toBe(6);
    });

    it("should narrow to a component when the entity names one", async () => {
      // given
      withSiteMetadata([]);
      withSearch([]);
      withCounts(0);
      const repositories = [aJiraRepository({ id: "one", component: "gateway" })];
      const { enricher, context } = createEnricher({ repositories });

      // when
      const metrics = await enricher.fetchRepositories(repositories, context);

      // then
      expect(metrics.get("one")?.component).toBe("gateway");
      expect(server.requestsFor("/search/jql")[0]?.body).toContain('component = \\"gateway\\"');
    });
  });

  describe("per-day slicing", () => {
    it("should split the window into days without asking Jira again", async () => {
      // given
      // A range picker offering "last March" deserves March's answer rather
      // than a trailing window relabelled.
      withSiteMetadata([]);
      withSearch([
        aResolvedIssue("PLAT-1", "dev-1"),
        JiraIssueBuilder.create()
          .withKey("PLAT-2")
          .withReporter(JiraIssueBuilder.account("dev-2"))
          .withCreated("2026-08-07T09:00:00.000Z")
          .build(),
      ]);
      withCounts(0);
      const { enricher, context } = createEnricher();

      // when
      await enricher.fetchContributors(context);
      const byDay = await enricher.fetchContributorsByDay(context);

      // then
      expect(byDay.get("2026-08-03")?.get("reporter-1")?.issuesCreated).toBe(1);
      expect(byDay.get("2026-08-05")?.get("dev-1")?.issuesResolved).toBe(1);
      expect(byDay.get("2026-08-07")?.get("dev-2")?.issuesCreated).toBe(1);
      // Days nobody touched are absent rather than empty, so the store keeps
      // "no activity" distinguishable from "not collected".
      expect(byDay.has("2026-08-06")).toBe(false);
      const activity = server
        .requestsFor("/search/jql")
        .filter((request) => !request.body.includes("statusCategory != Done"));
      expect(activity).toHaveLength(1);
    });

    it("should report nothing per day when the integration is off", async () => {
      // given
      const { enricher, context } = createEnricher({ settings: { enabled: false } });

      // when
      const byDay = await enricher.fetchContributorsByDay(context);

      // then
      expect(byDay.size).toBe(0);
    });
  });
});

/**
 * Lives beside the enricher rather than in its own file because it exists only
 * to build what the enricher takes, and the mapping it encodes is the wiring
 * the backend plugin performs once.
 */
describe("jiraSettingsFrom", () => {
  it("should take the credential block's Jira half and default the rest", () => {
    // given
    const atlassian = {
      historyDays: 30,
      jira: { enabled: true, storyPointsField: "customfield_10016" },
    };

    // when
    const settings = jiraSettingsFrom(atlassian);

    // then
    expect(settings).toEqual({
      ...DEFAULT_JIRA_SETTINGS,
      enabled: true,
      storyPointsField: "customfield_10016",
      historyDays: 30,
    });
  });

  it("should let a caller override anything the credential block does not carry", () => {
    // given
    const atlassian = { historyDays: 0, jira: { enabled: false, storyPointsField: null } };

    // when
    const settings = jiraSettingsFrom(atlassian, { filter: "labels != noise" });

    // then
    expect(settings.filter).toBe("labels != noise");
    expect(settings.enabled).toBe(false);
    expect(DEFAULT_JIRA_SETTINGS.historyDays).toBe(DEFAULT_JIRA_HISTORY_DAYS);
  });
});
