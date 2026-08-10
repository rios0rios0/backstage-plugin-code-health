import { RequestBudget } from "../../../src/domain/entities/request_budget";
import { DEFAULT_WAKATIME_BASE_URL } from "../../../src/domain/entities/ingestion_settings";
import { ProviderGateway } from "../../../src/infrastructure/http/provider_gateway";
import { WakaTimeApiEnricher } from "../../../src/infrastructure/services/wakatime_enricher";
import { ControlledClock } from "../../doubles/controlled_clock";
import { RecordingLogger } from "../../doubles/recording_logger";
import { TestProviderServer } from "../../doubles/test_provider_server";

const server = new TestProviderServer();

beforeAll(async () => server.start());
afterAll(async () => server.stop());
beforeEach(() => server.reset());

const createEnricher = (
  settings: { organization: string | null; apiKey: string | null } = {
    organization: "example-org",
    apiKey: "fixture-token-placeholder",
  },
) => {
  const logger = new RecordingLogger();
  const enricher = new WakaTimeApiEnricher({
    gateway: new ProviderGateway({
      logger,
      concurrencyPerHost: 4,
      clock: new ControlledClock(1_000_000),
    }),
    settings: { ...settings, baseUrl: server.baseUrl },
    logger,
  });
  return { enricher, logger };
};

const context = () => ({ budget: new RequestBudget(50) });

describe("WakaTimeApiEnricher", () => {
  it("should summarise every organisation member", async () => {
    // given
    server
      .on("/members", () => ({
        body: {
          data: [
            { user: { username: "dev", email: "Dev@Example.COM" } },
            { user: { username: "other", email: "other@example.com" } },
          ],
        },
      }))
      .on("/summaries", () => ({
        body: { cumulative_total: { seconds: 7200.4 }, daily_average: { seconds: 240.6 } },
      }));

    // when
    const result = await createEnricher().enricher.fetchAll(context());

    // then
    expect(result.size).toBe(2);
    expect(result.get("dev@example.com")).toEqual({
      totalSeconds: 7200,
      dailyAverageSeconds: 241,
    });
  });

  it("should key members on the same identity commit events carry", async () => {
    // given
    // The contributors view joins these onto commit authors, so a differently
    // cased address has to normalise to the same key or the join silently
    // misses.
    server
      .on("/members", () => ({ body: { data: [{ user: { username: "dev", email: "DEV@EXAMPLE.COM" } }] } }))
      .on("/summaries", () => ({ body: { cumulative_total: { seconds: 60 } } }));

    // when
    const result = await createEnricher().enricher.fetchAll(context());

    // then
    expect([...result.keys()]).toEqual(["dev@example.com"]);
  });

  it("should fall back to the username when a member has no e-mail", async () => {
    // given
    server
      .on("/members", () => ({ body: { data: [{ user: { username: "Dev" } }] } }))
      .on("/summaries", () => ({ body: { cumulative_total: { seconds: 60 } } }));

    // when
    const result = await createEnricher().enricher.fetchAll(context());

    // then
    expect([...result.keys()]).toEqual(["dev"]);
  });

  it("should send the key as a basic credential rather than in the query string", async () => {
    // given
    // A key in a query string ends up in access logs and proxy caches.
    server
      .on("/members", () => ({ body: { data: [] } }))
      .on("/summaries", () => ({ body: {} }));

    // when
    await createEnricher().enricher.fetchAll(context());

    // then
    expect(server.requests[0].headers.authorization).toMatch(/^Basic /);
    expect(server.requests[0].query.toString()).toBe("");
  });

  it("should do nothing when no key is configured", async () => {
    // given
    // WakaTime is optional; an installation without a key simply has no coding
    // time to show.
    const { enricher } = createEnricher({ organization: "example-org", apiKey: null });

    // when
    const result = await enricher.fetchAll(context());

    // then
    expect(result.size).toBe(0);
    expect(server.requests).toEqual([]);
  });

  it("should do nothing when no organisation is configured", async () => {
    // given
    const { enricher } = createEnricher({
      organization: null,
      apiKey: "fixture-token-placeholder",
    });

    // when
    const result = await enricher.fetchAll(context());

    // then
    expect(result.size).toBe(0);
  });

  it("should return nothing when the member list cannot be read", async () => {
    // given
    const { enricher, logger } = createEnricher();
    server.on("/members", () => ({ status: 403, body: { error: "forbidden" } }));

    // when
    const result = await enricher.fetchAll(context());

    // then
    expect(result.size).toBe(0);
    expect(logger.at("warn").join(" ")).toContain("could not list WakaTime members");
  });

  it("should skip a member whose summary is unavailable", async () => {
    // given
    // One member's private settings must not cost the whole organisation its
    // measures.
    server
      .on("/members", () => ({
        body: {
          data: [{ user: { username: "visible" } }, { user: { username: "private" } }],
        },
      }))
      .route((request) => {
        if (!request.path.includes("/summaries")) return undefined;
        if (request.path.includes("private")) return { status: 403, body: {} };
        return { body: { cumulative_total: { seconds: 60 } } };
      });

    // when
    const result = await createEnricher().enricher.fetchAll(context());

    // then
    expect([...result.keys()]).toEqual(["visible"]);
  });

  it("should skip a member entry with no username", async () => {
    // given
    server
      .on("/members", () => ({ body: { data: [{ user: {} }, {}] } }))
      .on("/summaries", () => ({ body: {} }));

    // when
    const result = await createEnricher().enricher.fetchAll(context());

    // then
    expect(result.size).toBe(0);
  });

  it("should default to the public WakaTime API", () => {
    // given / when / then
    expect(DEFAULT_WAKATIME_BASE_URL).toBe("https://wakatime.com/api/v1");
  });
});
