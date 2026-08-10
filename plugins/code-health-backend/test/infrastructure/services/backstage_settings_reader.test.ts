import { ConfigReader } from "@backstage/config";
import type { JsonObject } from "@backstage/types";
import { readCodeHealthSettings } from "../../../src/infrastructure/services/backstage_settings_reader";

const read = (data: JsonObject) => readCodeHealthSettings(new ConfigReader(data));

describe("readCodeHealthSettings", () => {
  it("should fall back to every default when nothing is configured", () => {
    // given / when
    const settings = read({});

    // then
    expect(settings.ingestion).toMatchObject({
      entityFilters: [{ kind: "Component" }],
      retentionDays: 365,
      backfillChunkDays: 1,
      requestBudgetPerRun: 500,
      concurrencyPerHost: 4,
    });
    expect(settings.sonar.enabled).toBe(false);
    expect(settings.wakaTime).toEqual({
      organization: null,
      apiKey: null,
      baseUrl: "https://wakatime.com/api/v1",
    });
  });

  it("should schedule the three tasks globally by default", () => {
    // given / when
    const settings = read({});

    // then
    // `scope: 'global'` is what makes the actor run once across replicas rather
    // than once per replica, which is the difference between one provider load
    // and N of them.
    expect(settings.ingestion.schedule.scope).toBe("global");
    expect(settings.ingestion.discoverySchedule.scope).toBe("global");
    expect(settings.ingestion.snapshotSchedule.scope).toBe("global");
  });

  it("should read the configured entity filters", () => {
    // given / when
    const settings = read({
      codeHealth: {
        catalog: { entityFilter: [{ kind: "Component" }, { kind: "Resource" }] },
      },
    });

    // then
    expect(settings.ingestion.entityFilters).toEqual([{ kind: "Component" }, { kind: "Resource" }]);
  });

  it("should ignore an empty filter list rather than tracking nothing", () => {
    // given / when
    const settings = read({ codeHealth: { catalog: { entityFilter: [] } } });

    // then
    expect(settings.ingestion.entityFilters).toEqual([{ kind: "Component" }]);
  });

  it("should discard filter entries that are not objects", () => {
    // given / when
    const settings = read({
      codeHealth: { catalog: { entityFilter: [{ kind: "Component" }, "kind=Resource"] } },
    });

    // then
    expect(settings.ingestion.entityFilters).toEqual([{ kind: "Component" }]);
  });

  it("should fall back when every filter entry is unusable", () => {
    // given / when
    const settings = read({
      codeHealth: { catalog: { entityFilter: ["kind=Component", ["kind"]] } },
    });

    // then
    // Tracking nothing would look identical to an empty catalog, so an
    // unusable filter falls back rather than silently disabling the plugin.
    expect(settings.ingestion.entityFilters).toEqual([{ kind: "Component" }]);
  });

  it("should parse a weekly backfill chunk into days", () => {
    // given / when
    const settings = read({ codeHealth: { ingestion: { backfillChunk: "P7D" } } });

    // then
    expect(settings.ingestion.backfillChunkDays).toBe(7);
  });

  it("should reject a non-positive request budget", () => {
    // given / when
    // A budget of zero would stall the actor forever with no error to explain it.
    const settings = read({ codeHealth: { ingestion: { requestBudgetPerRun: 0 } } });

    // then
    expect(settings.ingestion.requestBudgetPerRun).toBe(500);
  });

  it("should reject a negative retention window", () => {
    // given / when
    const settings = read({ codeHealth: { ingestion: { retentionDays: -30 } } });

    // then
    expect(settings.ingestion.retentionDays).toBe(365);
  });

  it("should truncate a fractional concurrency limit", () => {
    // given / when
    const settings = read({ codeHealth: { ingestion: { concurrencyPerHost: 2.7 } } });

    // then
    expect(settings.ingestion.concurrencyPerHost).toBe(2);
  });

  it("should read a configured schedule", () => {
    // given / when
    const settings = read({
      codeHealth: {
        ingestion: {
          schedule: {
            frequency: { minutes: 1 },
            timeout: { minutes: 2 },
            scope: "local",
          },
        },
      },
    });

    // then
    expect(settings.ingestion.schedule.scope).toBe("local");
    expect(settings.ingestion.schedule.frequency).toEqual({ minutes: 1 });
  });

  it("should read the WakaTime credentials from backend configuration", () => {
    // given / when
    // The old browser-side key is gone; this is the only place the value lives,
    // and it is declared `@visibility secret` so it never reaches a browser.
    const settings = read({
      codeHealth: {
        wakaTime: { organization: "example-org", apiKey: "fixture-token-placeholder" },
      },
    });

    // then
    expect(settings.wakaTime.organization).toBe("example-org");
    expect(settings.wakaTime.apiKey).toBe("fixture-token-placeholder");
  });

  it("should enable Sonar enrichment when asked to", () => {
    // given / when
    const settings = read({ codeHealth: { sonar: { enabled: true } } });

    // then
    expect(settings.sonar.enabled).toBe(true);
  });
});
