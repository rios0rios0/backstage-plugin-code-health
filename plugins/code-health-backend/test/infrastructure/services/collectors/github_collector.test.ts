import { RequestBudget } from "../../../../src/domain/entities/request_budget";
import { ProviderGateway } from "../../../../src/infrastructure/http/provider_gateway";
import { GithubCollector } from "../../../../src/infrastructure/services/collectors/github_collector";
import { aTrackedRepository } from "../../../builders/tracked_repository_builder";
import { ControlledClock } from "../../../doubles/controlled_clock";
import { RecordingLogger } from "../../../doubles/recording_logger";
import { StubCredentialsResolver } from "../../../doubles/stub_credentials_resolver";
import { TestProviderServer } from "../../../doubles/test_provider_server";

const server = new TestProviderServer();

const WINDOW = {
  from: new Date("2026-08-09T00:00:00.000Z"),
  to: new Date("2026-08-10T00:00:00.000Z"),
};

beforeAll(async () => server.start());
afterAll(async () => server.stop());
beforeEach(() => server.reset());

const createCollector = (
  credentials = new StubCredentialsResolver(),
  clock = new ControlledClock(1_000_000),
) => {
  const logger = new RecordingLogger();
  const gateway = new ProviderGateway({ logger, concurrencyPerHost: 4, clock });
  const collector = new GithubCollector({
    gateway,
    credentials,
    logger,
    graphqlUrl: `${server.baseUrl}/graphql`,
    restUrl: server.baseUrl,
  });
  return { collector, logger, gateway, clock, credentials };
};

/** The GraphQL operation name a request carries, used to route replies. */
const operationOf = (body: string): string => {
  const parsed = JSON.parse(body) as { query: string; variables: Record<string, unknown> };
  if (parsed.query.includes("CodeHealthHistory")) return "history";
  return "pullRequests";
};

const graphqlVariables = (body: string): Record<string, unknown> =>
  (JSON.parse(body) as { variables: Record<string, unknown> }).variables;

const emptyHistory = {
  data: {
    rateLimit: { limit: 5000, remaining: 4999, resetAt: "2026-08-09T13:00:00Z", cost: 1 },
    repository: {
      databaseId: 12345,
      isArchived: false,
      defaultBranchRef: {
        name: "main",
        target: { history: { pageInfo: { hasNextPage: false }, nodes: [] } },
      },
    },
  },
};

const emptySearch = {
  data: {
    rateLimit: { limit: 5000, remaining: 4999, resetAt: "2026-08-09T13:00:00Z", cost: 1 },
    search: { pageInfo: { hasNextPage: false }, nodes: [] },
  },
};

const withEmptyDefaults = () =>
  server
    .on("/graphql", (request) => ({
      body: operationOf(request.body) === "history" ? emptyHistory : emptySearch,
    }))
    .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

const collect = async () => {
  const { collector } = createCollector();
  return collector.collect(aTrackedRepository(), WINDOW, { budget: new RequestBudget(50) });
};

describe("GithubCollector", () => {
  describe("commits", () => {
    it("should map a commit with its line counts", async () => {
      // given
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) !== "history") return { body: emptySearch };
          return {
            body: {
              data: {
                rateLimit: { limit: 5000, remaining: 4999, resetAt: "2026-08-09T13:00:00Z" },
                repository: {
                  databaseId: 12345,
                  isArchived: false,
                  defaultBranchRef: {
                    name: "main",
                    target: {
                      history: {
                        pageInfo: { hasNextPage: false },
                        nodes: [
                          {
                            oid: "abc123",
                            messageHeadline: "fixed the thing",
                            committedDate: "2026-08-09T10:00:00Z",
                            additions: 42,
                            deletions: 7,
                            changedFilesIfAvailable: 3,
                            url: "https://github.com/commit/abc123",
                            author: {
                              name: "Dev Example",
                              email: "dev@example.com",
                              user: { login: "DevExample", avatarUrl: "https://avatar" },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      // GitHub reports lines, unlike Azure DevOps, so these are populated here
      // and left null there rather than being made to look comparable.
      const commit = result.events.find((event) => event.kind === "commit");
      expect(commit).toMatchObject({
        externalId: "abc123",
        additions: 42,
        deletions: 7,
        changedFiles: 3,
        actorKey: "devexample",
        actorName: "DevExample",
      });
    });

    it("should fall back to the commit e-mail when the author has no linked account", async () => {
      // given
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) !== "history") return { body: emptySearch };
          return {
            body: {
              data: {
                repository: {
                  defaultBranchRef: {
                    name: "main",
                    target: {
                      history: {
                        pageInfo: { hasNextPage: false },
                        nodes: [
                          {
                            oid: "abc123",
                            committedDate: "2026-08-09T10:00:00Z",
                            author: { name: "Dev", email: "Dev@Example.COM" },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      expect(result.events[0].actorKey).toBe("dev@example.com");
    });

    it("should ask for the exact window rather than a calendar day", async () => {
      // given
      withEmptyDefaults();

      // when
      await collect();

      // then
      const history = server.requests.find(
        (request) => request.body.includes("CodeHealthHistory"),
      );
      expect(graphqlVariables(history!.body)).toMatchObject({
        owner: "rios0rios0",
        name: "pipelines",
        since: WINDOW.from.toISOString(),
        until: WINDOW.to.toISOString(),
      });
    });

    it("should follow the history cursor across pages", async () => {
      // given
      let served = 0;
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) !== "history") return { body: emptySearch };
          served += 1;
          return {
            body: {
              data: {
                repository: {
                  defaultBranchRef: {
                    name: "main",
                    target: {
                      history: {
                        pageInfo:
                          served === 1
                            ? { hasNextPage: true, endCursor: "cursor-2" }
                            : { hasNextPage: false },
                        nodes: [
                          {
                            oid: `sha-${served}`,
                            committedDate: "2026-08-09T10:00:00Z",
                            author: { email: "dev@example.com" },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      expect(result.events.filter((event) => event.kind === "commit")).toHaveLength(2);
      const second = server.requests.filter((request) =>
        request.body.includes("CodeHealthHistory"),
      )[1];
      expect(graphqlVariables(second.body).cursor).toBe("cursor-2");
    });
  });

  describe("errors", () => {
    it("should fail the window when GraphQL reports an error", async () => {
      // given
      // GraphQL errors arrive with HTTP 200, so the gateway cannot see them.
      // Treating one as an empty result would mark the window ingested and lose
      // that day permanently.
      server
        .on("/graphql", () => ({
          body: { errors: [{ message: "Could not resolve to a Repository" }] },
        }))
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when / then
      await expect(collect()).rejects.toThrow("Could not resolve to a Repository");
    });
  });

  describe("rate limiting", () => {
    it("should pace itself from the allowance GitHub reports in the body", async () => {
      // given
      const clock = new ControlledClock(1_000_000);
      const { collector } = createCollector(new StubCredentialsResolver(), clock);
      const resetAt = new Date(1_000_000 + 30_000).toISOString();
      server
        .on("/graphql", (request) => ({
          body:
            operationOf(request.body) === "history"
              ? {
                  data: {
                    rateLimit: { limit: 5000, remaining: 0, resetAt },
                    repository: {
                      defaultBranchRef: {
                        name: "main",
                        target: { history: { pageInfo: { hasNextPage: false }, nodes: [] } },
                      },
                    },
                  },
                }
              : emptySearch,
        }))
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      await collector.collect(aTrackedRepository(), WINDOW, { budget: new RequestBudget(50) });
      const sleptDuringFirst = clock.totalSlept;
      await collector.collect(aTrackedRepository(), WINDOW, { budget: new RequestBudget(50) });

      // then
      // The allowance is in the payload rather than a header, so it only gets
      // acted on because the collector hands it back to the gateway. Pacing
      // applies to what comes next, so the second collection is what waits.
      expect(sleptDuringFirst).toBe(0);
      expect(clock.totalSlept).toBeGreaterThan(0);
    });
  });

  describe("pull requests", () => {
    it("should search separately for opened and for closed", async () => {
      // given
      withEmptyDefaults();

      // when
      await collect();

      // then
      // The `pullRequests` connection has no date filter at all, so search is
      // the only way to bound a window.
      const searches = server.requests
        .filter((request) => request.body.includes("CodeHealthPullRequests"))
        .map((request) => graphqlVariables(request.body).search);
      expect(searches).toEqual([
        "repo:rios0rios0/pipelines is:pr created:2026-08-09..2026-08-10",
        "repo:rios0rios0/pipelines is:pr closed:2026-08-09..2026-08-10",
      ]);
    });

    it("should record a merged pull request and its reviews", async () => {
      // given
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) === "history") return { body: emptyHistory };
          const search = String(graphqlVariables(request.body).search);
          if (!search.includes("closed:")) return { body: emptySearch };
          return {
            body: {
              data: {
                search: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      number: 42,
                      title: "add the thing",
                      state: "MERGED",
                      createdAt: "2026-08-09T08:00:00Z",
                      mergedAt: "2026-08-09T12:00:00Z",
                      author: { login: "DevExample", avatarUrl: "https://avatar" },
                      reviews: {
                        nodes: [
                          {
                            id: "review-1",
                            state: "APPROVED",
                            submittedAt: "2026-08-09T11:00:00Z",
                            author: { login: "Reviewer" },
                          },
                          {
                            id: "review-2",
                            state: "CHANGES_REQUESTED",
                            submittedAt: "2026-08-09T10:00:00Z",
                            author: { login: "Blocker" },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      const pullRequest = result.events.find((event) => event.kind === "pull_request");
      expect(pullRequest).toMatchObject({ externalId: "42:closed", outcome: "merged" });
      const reviews = result.events.filter((event) => event.kind === "pr_review");
      expect(reviews.map((event) => event.outcome).sort()).toEqual(["approved", "rejected"]);
    });

    it("should discard a result outside the real window bounds", async () => {
      // given
      // GitHub search filters by calendar day, so a window narrower than a day
      // comes back over-inclusive and has to be trimmed.
      const narrow = {
        from: new Date("2026-08-09T12:00:00.000Z"),
        to: new Date("2026-08-09T18:00:00.000Z"),
      };
      const { collector } = createCollector();
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) === "history") return { body: emptyHistory };
          return {
            body: {
              data: {
                search: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      number: 7,
                      createdAt: "2026-08-09T03:00:00Z",
                      author: { login: "dev" },
                    },
                  ],
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collector.collect(aTrackedRepository(), narrow, {
        budget: new RequestBudget(50),
      });

      // then
      expect(result.events.filter((event) => event.kind === "pull_request")).toEqual([]);
    });

    it("should mark a closed but unmerged pull request as abandoned", async () => {
      // given
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) === "history") return { body: emptyHistory };
          const search = String(graphqlVariables(request.body).search);
          if (!search.includes("closed:")) return { body: emptySearch };
          return {
            body: {
              data: {
                search: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      number: 8,
                      state: "CLOSED",
                      createdAt: "2026-08-09T08:00:00Z",
                      closedAt: "2026-08-09T12:00:00Z",
                      author: { login: "dev" },
                    },
                  ],
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      expect(result.events.find((event) => event.kind === "pull_request")?.outcome).toBe(
        "abandoned",
      );
    });
  });

  describe("workflow runs", () => {
    it("should map a run conclusion to an outcome", async () => {
      // given
      server.on("/actions/runs", () => ({
        body: {
          workflow_runs: [
            {
              id: 900,
              name: "default",
              head_branch: "main",
              status: "completed",
              conclusion: "failure",
              updated_at: "2026-08-09T11:00:00Z",
              actor: { login: "DevExample", avatar_url: "https://avatar" },
            },
          ],
        },
      }));
      withEmptyDefaults();

      // when
      const result = await collect();

      // then
      const build = result.events.find((event) => event.kind === "build");
      expect(build).toMatchObject({
        externalId: "900",
        outcome: "failed",
        actorKey: "devexample",
      });
    });

    it("should carry on when the repository has Actions disabled", async () => {
      // given
      // A 404 here is a normal configuration rather than a failed window, and
      // the commits already collected are still worth keeping.
      server.on("/graphql", (request) => ({
        body: operationOf(request.body) === "history" ? emptyHistory : emptySearch,
      }));

      // when
      const result = await collect();

      // then
      expect(result.events.filter((event) => event.kind === "build")).toEqual([]);
    });
  });

  describe("repository facts", () => {
    it("should learn the database identifier, default branch and archived flag", async () => {
      // given
      withEmptyDefaults();

      // when
      const result = await collect();

      // then
      expect(result.repositoryFacts).toMatchObject({
        defaultBranch: "main",
        externalId: "12345",
        archived: false,
      });
    });
  });

  describe("sparse payloads", () => {
    it("should map every kind when the payload omits all optional fields", async () => {
      // given
      // GitHub omits rather than nulls, and which fields come back depends on
      // the token's scopes. A minimal payload has to map cleanly, because the
      // alternative is losing the whole window to a `TypeError`.
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) === "history") {
            return {
              body: {
                data: {
                  repository: {
                    defaultBranchRef: {
                      target: {
                        history: {
                          pageInfo: {},
                          nodes: [{ oid: "abc123", committedDate: "2026-08-09T10:00:00Z" }],
                        },
                      },
                    },
                  },
                },
              },
            };
          }
          const search = String(graphqlVariables(request.body).search);
          return {
            body: {
              data: {
                search: {
                  pageInfo: {},
                  nodes: search.includes("closed:")
                    ? [
                        {
                          number: 1,
                          closedAt: "2026-08-09T15:00:00Z",
                          reviews: { nodes: [{ id: "r1", author: { login: "Reviewer" } }] },
                        },
                      ]
                    : [{ number: 1, createdAt: "2026-08-09T09:00:00Z" }],
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({
          body: { workflow_runs: [{ id: 900, updated_at: "2026-08-09T11:00:00Z" }] },
        }));

      // when
      const result = await collect();

      // then
      const byKind = (kind: string) => result.events.filter((event) => event.kind === kind);
      expect(byKind("commit")[0]).toMatchObject({
        actorKey: null,
        additions: null,
        changedFiles: null,
      });
      // Closed but never merged is abandoned, not merged, so a payload the
      // plugin failed to understand cannot inflate the merge rate.
      expect(byKind("pull_request").find((event) => event.externalId === "1:closed")?.outcome).toBe(
        "abandoned",
      );
      expect(byKind("pr_review")[0]).toMatchObject({ outcome: "no_vote" });
      expect(byKind("build")[0]).toMatchObject({ outcome: null, actorKey: null });
    });

    it("should stop when a repository cannot be read at all", async () => {
      // given
      server
        .on("/graphql", (request) => ({
          body: operationOf(request.body) === "history" ? { data: {} } : emptySearch,
        }))
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      expect(result.events).toEqual([]);
      expect(result.repositoryFacts).toBeUndefined();
    });

    it("should stop paging when a cursor is missing despite hasNextPage", async () => {
      // given
      // A page that claims more results but names no cursor would otherwise
      // loop until the page guard, spending the budget on the same request.
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) !== "history") return { body: emptySearch };
          return {
            body: {
              data: {
                repository: {
                  defaultBranchRef: {
                    target: { history: { pageInfo: { hasNextPage: true }, nodes: [] } },
                  },
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      await collect();

      // then
      expect(
        server.requests.filter((request) => request.body.includes("CodeHealthHistory")),
      ).toHaveLength(1);
    });

    it("should skip a review with no author", async () => {
      // given
      server
        .on("/graphql", (request) => {
          if (operationOf(request.body) === "history") return { body: emptyHistory };
          const search = String(graphqlVariables(request.body).search);
          if (!search.includes("closed:")) return { body: emptySearch };
          return {
            body: {
              data: {
                search: {
                  pageInfo: {},
                  nodes: [
                    {
                      number: 1,
                      mergedAt: "2026-08-09T15:00:00Z",
                      reviews: { nodes: [{ id: "r1" }, null] },
                    },
                  ],
                },
              },
            },
          };
        })
        .on("/actions/runs", () => ({ body: { workflow_runs: [] } }));

      // when
      const result = await collect();

      // then
      expect(result.events.filter((event) => event.kind === "pr_review")).toEqual([]);
    });

    it("should skip a workflow run outside the window", async () => {
      // given
      // Registered before the empty defaults, because the first matching route
      // answers and an empty list would make this pass without exercising the
      // trimming at all.
      server.on("/actions/runs", () => ({
        body: { workflow_runs: [{ id: 901, updated_at: "2026-08-08T11:00:00Z" }] },
      }));
      withEmptyDefaults();

      // when
      const result = await collect();

      // then
      expect(result.events.filter((event) => event.kind === "build")).toEqual([]);
    });
  });

  describe("snapshot", () => {
    const snapshotContext = () => ({
      budget: new RequestBudget(50),
      projectCache: new Map<string, unknown>(),
    });

    const snapshotBody = (overrides: Record<string, unknown> = {}) => ({
      data: {
        rateLimit: { limit: 5000, remaining: 4999, resetAt: "2026-08-10T13:00:00Z" },
        repository: {
          databaseId: 12345,
          description: "the pipelines",
          isArchived: false,
          isFork: false,
          isPrivate: false,
          updatedAt: "2026-08-10T02:00:00Z",
          primaryLanguage: { name: "Go" },
          defaultBranchRef: {
            name: "main",
            target: {
              oid: "abc123",
              messageHeadline: "fixed the thing",
              url: "https://github.com/commit/abc123",
              statusCheckRollup: { state: "SUCCESS" },
            },
          },
          latestRelease: {
            tagName: "v1.2.0",
            name: "1.2.0",
            publishedAt: "2026-08-09T10:00:00Z",
            url: "https://github.com/release",
            isPrerelease: false,
          },
          tags: { nodes: [{ name: "v1.2.0", target: { oid: "abc123" } }] },
          branches: { nodes: [{ name: "main" }, { name: "release" }] },
          branchProtectionRules: { totalCount: 1 },
          rulesets: { totalCount: 0 },
          readme: {
            text: "![Build Status](https://img.shields.io/github/actions/workflow/status/x/y)",
          },
          workflows: { entries: [{ name: "default.yaml", type: "blob" }] },
          ...overrides,
        },
      },
    });

    it("should assemble everything in a single request", async () => {
      // given
      // The previous design spent three requests per repository per dashboard
      // load on this; one document a day replaces all of them.
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: snapshotBody() }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(server.requests).toHaveLength(1);
      expect(result.payload).toMatchObject({
        description: "the pipelines",
        primaryLanguage: "Go",
        visibility: "PUBLIC",
        defaultBranch: "main",
        branches: ["main", "release"],
      });
      expect(result.payload.ciStatus).toMatchObject({ state: "SUCCESS", commitSha: "abc123" });
      expect(result.payload.latestRelease).toMatchObject({ tagName: "v1.2.0" });
      expect(result.payload.latestTag).toMatchObject({ name: "v1.2.0" });
    });

    it("should treat a ruleset as branch protection", async () => {
      // given
      // Rulesets are the newer mechanism; a repository configured only with them
      // would otherwise read as completely unprotected.
      const { collector } = createCollector();
      server.on("/graphql", () => ({
        body: snapshotBody({
          branchProtectionRules: { totalCount: 0 },
          rulesets: { totalCount: 2 },
        }),
      }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.payload.complianceStatus?.branchProtection).toBe(true);
    });

    it("should report no pipeline when the workflow directory holds no workflow", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({
        body: snapshotBody({ workflows: { entries: [{ name: "README.md", type: "blob" }] } }),
      }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.payload.complianceStatus?.pipelineExists).toBe(false);
    });

    it("should mark a private repository private", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: snapshotBody({ isPrivate: true }) }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.payload.visibility).toBe("PRIVATE");
    });

    it("should emit a release event for the latest release", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: snapshotBody() }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        kind: "release",
        externalId: "v1.2.0",
        occurredAt: new Date("2026-08-09T10:00:00Z"),
      });
    });

    it("should read badges out of the README", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: snapshotBody() }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      const build = result.payload.badgeStatus?.checks.find(
        (check) => check.label === "Build Status",
      );
      expect(build?.present).toBe(true);
    });

    it("should leave badges unset when there is no README", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: snapshotBody({ readme: null }) }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.payload.badgeStatus).toBeNull();
    });

    it("should render a snapshot when the payload omits everything optional", async () => {
      // given
      // A token without full scopes, or a repository with no default branch,
      // returns almost nothing. Losing the whole day's snapshot to a
      // `TypeError` would be worse than storing a sparse one.
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: { data: { repository: {} } } }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.payload).toMatchObject({
        description: null,
        primaryLanguage: null,
        visibility: "PUBLIC",
        isArchived: false,
        isFork: false,
        ciStatus: null,
        latestRelease: null,
        latestTag: null,
        branches: [],
        badgeStatus: null,
      });
      expect(result.events).toEqual([]);
      expect(result.payload.complianceStatus).toMatchObject({
        pipelineExists: false,
        branchProtection: false,
        color: "red",
      });
    });

    it("should not emit a release event for a release with no publication date", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({
        body: snapshotBody({ latestRelease: { tagName: "v1.0.0" } }),
      }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      // The event stream is keyed on when things happened; an undated release
      // has nowhere to sit in it.
      expect(result.events).toEqual([]);
      expect(result.payload.latestRelease).toMatchObject({ tagName: "v1.0.0" });
    });

    it("should report an unrecognised rollup state as none", async () => {
      // given
      const { collector } = createCollector();
      server.on("/graphql", () => ({
        body: snapshotBody({
          defaultBranchRef: {
            name: "main",
            target: { oid: "abc123", statusCheckRollup: { state: "SOMETHING_NEW" } },
          },
        }),
      }));

      // when
      const result = await collector.snapshot(aTrackedRepository(), snapshotContext());

      // then
      expect(result.payload.ciStatus?.state).toBe("NONE");
    });

    it("should fail when GitHub returns no repository", async () => {
      // given
      // Storing an empty snapshot would overwrite yesterday's real one with
      // nothing, and that day cannot be recovered.
      const { collector } = createCollector();
      server.on("/graphql", () => ({ body: { data: {} } }));

      // when / then
      await expect(
        collector.snapshot(aTrackedRepository(), snapshotContext()),
      ).rejects.toThrow("returned no repository");
    });
  });
});
