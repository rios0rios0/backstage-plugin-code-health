import { mockServices, startTestBackend, TestDatabases } from "@backstage/backend-test-utils";
import type { Entity } from "@backstage/catalog-model";
import { catalogServiceMock } from "@backstage/plugin-catalog-node/testUtils";
import request from "supertest";
import { codeHealthPlugin } from "../src/plugin";

// The database is supplied explicitly rather than letting the backend create
// its own, so `TestDatabases` owns the connection lifecycle and Jest workers
// exit cleanly instead of being force-killed with a leak warning.
const databases = TestDatabases.create({ ids: ["SQLITE_3"], disableDocker: true });

/**
 * End-to-end tests for the plugin as a host application wires it: real
 * migrations against a real in-memory database, a real scheduler, and a
 * catalog it can actually read.
 */
const componentWithSlug = (name: string, slug: string): Entity => ({
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name,
    namespace: "default",
    annotations: { "github.com/project-slug": slug },
  },
  spec: { type: "service", owner: "team-a" },
});

const started: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  // Without this the scheduler keeps its timers alive and Jest force-exits the
  // worker, which hides real leaks behind a warning.
  await Promise.all(started.splice(0).map((backend) => backend.stop()));
});

const startBackend = async (entities: Entity[]) => {
  const knex = await databases.init("SQLITE_3");
  const backend = await startTestBackend({
    features: [
      codeHealthPlugin,
      mockServices.database.factory({ knex }),
      catalogServiceMock.factory({ entities }),
      mockServices.rootConfig.factory({
        data: {
          integrations: {
            github: [{ host: "github.com", token: "fixture-token-placeholder" }],
          },
          codeHealth: {
            ingestion: {
              // `startTestBackend` runs scheduled tasks immediately, so a short
              // frequency here keeps the test from waiting on the default.
              discoverySchedule: { frequency: { seconds: 1 }, timeout: { seconds: 30 } },
              // Ingestion is held back to a manual trigger. Left on a schedule
              // it would start immediately and issue real requests to
              // api.github.com, which would make this suite slow, flaky and
              // dependent on the network. What it does with a window is covered
              // against a real server elsewhere.
              schedule: { frequency: { trigger: "manual" }, timeout: { minutes: 1 } },
              snapshotSchedule: { frequency: { trigger: "manual" }, timeout: { minutes: 1 } },
            },
          },
        },
      }),
    ],
  });

  started.push(backend);
  return backend;
};

/** Polls until `check` passes, so the test does not race the scheduled task. */
const waitFor = async (check: () => Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("condition was not met before the deadline");
};

describe("codeHealthPlugin", () => {
  it("should answer the health probe without authentication", async () => {
    // given
    const { server } = await startBackend([]);

    // when
    const response = await request(server).get("/api/code-health/health");

    // then
    // The frontend probes this before rendering; requiring a token would make
    // "not installed" and "not signed in" indistinguishable.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("should reject an unauthenticated call to a data route", async () => {
    // given
    const { server } = await startBackend([]);

    // when
    const response = await request(server)
      .get("/api/code-health/v1/coverage")
      .set("Authorization", "Bearer mock-none-token");

    // then
    expect(response.status).toBe(401);
  });

  it("should report empty coverage before anything is discovered", async () => {
    // given
    const { server } = await startBackend([]);

    // when
    const response = await request(server).get("/api/code-health/v1/coverage");

    // then
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      earliestDay: null,
      latestDay: null,
      backfill: { repositories: 0, complete: 0, percent: 0 },
    });
  });

  it("should discover repositories from the catalog when the task runs", async () => {
    // given
    const { server } = await startBackend([
      componentWithSlug("pipelines", "rios0rios0/pipelines"),
      componentWithSlug("autobump", "rios0rios0/autobump"),
    ]);

    // when
    // `startTestBackend` installs a scheduler that runs registered tasks
    // immediately, so discovery is already in flight; this waits for it.
    await waitFor(async () => {
      const response = await request(server).get("/api/code-health/v1/coverage");
      return response.body.backfill.repositories === 2;
    });

    // then
    const response = await request(server).get("/api/code-health/v1/coverage");
    expect(response.body.backfill.repositories).toBe(2);
  });

  it("should ignore catalog entities that name no supported repository", async () => {
    // given
    const { server } = await startBackend([
      componentWithSlug("pipelines", "rios0rios0/pipelines"),
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: { name: "no-annotations", namespace: "default", annotations: {} },
        spec: { type: "service", owner: "team-a" },
      },
    ]);

    // when
    // `startTestBackend` installs a scheduler that runs registered tasks
    // immediately, so discovery is already in flight; this waits for it.
    await waitFor(async () => {
      const response = await request(server).get("/api/code-health/v1/coverage");
      return response.body.backfill.repositories === 1;
    });

    // then
    const response = await request(server).get("/api/code-health/v1/coverage");
    expect(response.body.backfill.repositories).toBe(1);
  });

  it("should expose how fresh the data is once ingestion has run", async () => {
    // given
    // The dashboard needs a ceiling it can trust. `freshUntil` is the minimum
    // across repositories, so it states the point *every* one has data through
    // rather than the point the luckiest one reached.
    const { server } = await startBackend([componentWithSlug("pipelines", "rios0rios0/pipelines")]);

    // when
    await waitFor(async () => {
      const response = await request(server).get("/api/code-health/v1/coverage");
      return response.body.backfill.repositories === 1;
    });

    // then
    const response = await request(server).get("/api/code-health/v1/coverage");
    expect(response.body).toHaveProperty("freshUntil");
  });


  describe("the read API", () => {
    it("should default to the last day when no window is given", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server).get("/api/code-health/v1/repositories");

      // then
      // A freshly installed plugin can only answer for the last day, so that is
      // what it answers with unless asked otherwise.
      expect(response.status).toBe(200);
      const span =
        Date.parse(response.body.window.to) - Date.parse(response.body.window.from);
      expect(span).toBe(24 * 60 * 60 * 1000);
    });

    it("should honour an explicit window", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server)
        .get("/api/code-health/v1/repositories")
        .query({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" });

      // then
      expect(response.body.window).toEqual({
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-08T00:00:00.000Z",
      });
    });

    it("should reject a window longer than the retention period", async () => {
      // given
      // An unbounded window would make one request scan the whole event table,
      // which any signed-in user could trigger by editing a URL.
      const { server } = await startBackend([]);

      // when
      const response = await request(server)
        .get("/api/code-health/v1/repositories")
        .query({ from: "2000-01-01T00:00:00.000Z", to: "2026-08-10T00:00:00.000Z" });

      // then
      expect(response.status).toBe(400);
    });

    it("should reject an inverted window", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server)
        .get("/api/code-health/v1/repositories")
        .query({ from: "2026-08-10T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" });

      // then
      expect(response.status).toBe(400);
    });

    it("should reject an unparseable instant", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server)
        .get("/api/code-health/v1/repositories")
        .query({ from: "last tuesday" });

      // then
      expect(response.status).toBe(400);
    });

    it("should list the discovered repositories", async () => {
      // given
      const { server } = await startBackend([
        componentWithSlug("pipelines", "rios0rios0/pipelines"),
      ]);
      await waitFor(async () => {
        const response = await request(server).get("/api/code-health/v1/coverage");
        return response.body.backfill.repositories === 1;
      });

      // when
      const response = await request(server).get("/api/code-health/v1/repositories");

      // then
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject({
        name: "pipelines",
        entityRef: "component:default/pipelines",
        platform: "github",
      });
    });

    it("should answer the contributors route with an empty list before ingestion", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server).get("/api/code-health/v1/contributors");

      // then
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
    });

    it("should reject a repeated repositoryId filter", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server).get(
        "/api/code-health/v1/contributors?repositoryId=a&repositoryId=b",
      );

      // then
      expect(response.status).toBe(400);
    });

    it("should answer 404 for a repository it does not track", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server).get(
        "/api/code-health/v1/repositories/does-not-exist/timeseries",
      );

      // then
      expect(response.status).toBe(404);
    });

    it("should return a time series for a tracked repository", async () => {
      // given
      const { server } = await startBackend([
        componentWithSlug("pipelines", "rios0rios0/pipelines"),
      ]);
      await waitFor(async () => {
        const response = await request(server).get("/api/code-health/v1/repositories");
        return response.body.items.length === 1;
      });
      const [repository] = (await request(server).get("/api/code-health/v1/repositories")).body
        .items;

      // when
      const response = await request(server)
        .get(`/api/code-health/v1/repositories/${repository.id}/timeseries`)
        .query({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-04T00:00:00.000Z" });

      // then
      expect(response.status).toBe(200);
      expect(response.body.bucket).toBe("day");
      expect(response.body.points.map((point: { day: string }) => point.day)).toEqual([
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
      ]);
    });

    it("should reject an unsupported bucket", async () => {
      // given
      const { server } = await startBackend([
        componentWithSlug("pipelines", "rios0rios0/pipelines"),
      ]);
      await waitFor(async () => {
        const response = await request(server).get("/api/code-health/v1/repositories");
        return response.body.items.length === 1;
      });
      const [repository] = (await request(server).get("/api/code-health/v1/repositories")).body
        .items;

      // when
      const response = await request(server)
        .get(`/api/code-health/v1/repositories/${repository.id}/timeseries`)
        .query({ bucket: "hour" });

      // then
      expect(response.status).toBe(400);
    });

    it("should trigger the background tasks on refresh", async () => {
      // given
      const { server } = await startBackend([]);

      // when
      const response = await request(server).post("/api/code-health/v1/refresh");

      // then
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.triggered)).toBe(true);
    });

    it("should refuse a refresh from a service rather than a person", async () => {
      // given
      // The route exists so someone looking at stale numbers can ask for a run,
      // and attributing that to a person is the point.
      const { server } = await startBackend([]);

      // when
      const response = await request(server)
        .post("/api/code-health/v1/refresh")
        .set("Authorization", "Bearer mock-service-token");

      // then
      expect(response.status).toBe(403);
    });
  });
});
