import { claudeTokenTotal } from "@rios0rios0/backstage-plugin-code-health-common";
import { RequestBudget } from "../../../src/domain/entities/request_budget";
import { ProviderGateway } from "../../../src/infrastructure/http/provider_gateway";
import { ClaudeApiEnricher } from "../../../src/infrastructure/services/claude_enricher";
import { parseClaudePage } from "../../../src/infrastructure/services/claude_node";
import { ClaudeReportBuilder } from "../../builders/claude_report_builder";
import { RecordingLogger } from "../../doubles/recording_logger";
import { TestProviderServer } from "../../doubles/test_provider_server";

const server = new TestProviderServer();
beforeAll(async () => server.start());
afterAll(async () => server.stop());
beforeEach(() => server.reset());
const day = "2026-09-25";
const enricher = () => new ClaudeApiEnricher({
  apiKey: "fixture-token-placeholder", baseUrl: server.baseUrl,
  gateway: new ProviderGateway({ logger: new RecordingLogger(), concurrencyPerHost: 2, maxAttempts: 1 }),
});

describe("Claude analytics provider", () => {
  it("should preserve a measured zero when an actor has no model usage", () => {
    // given
    const report = { ...ClaudeReportBuilder.create().build(), model_breakdown: [] };
    // when
    const result = parseClaudePage({ data: [report], has_more: false }, day);
    // then
    expect(claudeTokenTotal(result.records[0].metrics)).toBe(0);
    expect(result.records[0].metrics.daily).toHaveLength(1);
  });

  it("should reject an unexpected successful status instead of marking the day collected", async () => {
    // given
    server.onPath("/claude_code", () => ({ status: 202, body: {} }));
    // when
    const result = enricher().fetchDay(day, { budget: new RequestBudget(2) });
    // then
    await expect(result).rejects.toThrow("Claude analytics returned HTTP 202");
  });
  it("should authenticate, paginate and combine terminal records without mixing API keys with people", async () => {
    // given
    const report = ClaudeReportBuilder.create().build();
    server.onPath("/claude_code", (request) => ({ body: request.query.has("page")
      ? { data: [report, ClaudeReportBuilder.create().asApiKey("Dev@Example.com").build()], has_more: false }
      : { data: [report], has_more: true, next_page: "opaque+/=" } }));
    // when
    const result = await enricher().fetchDay(day, { budget: new RequestBudget(5) });
    // then
    expect(claudeTokenTotal(result.metrics.get("dev@example.com")!)).toBe(380);
    expect(claudeTokenTotal(result.metrics.get("api-key:dev@example.com")!)).toBe(190);
    expect(result.identities).toHaveLength(2);
    expect(result.identities.find((identity) => identity.sourceKey.startsWith("api-key:"))?.email).toBeNull();
    expect(server.requests[0].headers["x-api-key"]).toBe("fixture-token-placeholder");
    expect(server.requests[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(server.requests[0].query.get("starting_at")).toBe(day);
    expect(server.requests[1].query.get("page")).toBe("opaque+/=");
  });

  it("should reject an interrupted day instead of returning a partial total", async () => {
    // given
    server.onPath("/claude_code", () => ({ body: { data: [ClaudeReportBuilder.create().build()], has_more: true, next_page: "next" } }));
    const context = { budget: new RequestBudget(1) };
    // when
    const result = enricher().fetchDay(day, context);
    // then
    await expect(result).rejects.toThrow();
    expect(context.budget.refused).toBe(1);
  });

  it("should reject repeated pagination cursors", async () => {
    // given
    server.onPath("/claude_code", () => ({ body: { data: [], has_more: true, next_page: "same" } }));
    // when
    const result = enricher().fetchDay(day, { budget: new RequestBudget(5) });
    // then
    await expect(result).rejects.toThrow("Repeated Claude analytics cursor");
    expect(server.requests).toHaveLength(2);
  });

  it("should keep an empty successful day distinct from a provider error", async () => {
    // given
    server.onPath("/claude_code", () => ({ body: { data: [], has_more: false } }));
    // when
    const result = await enricher().fetchDay(day, { budget: new RequestBudget(2) });
    // then
    expect(result.metrics.size).toBe(0);
  });

  it("should not expose a provider response on an authorization failure", async () => {
    // given
    server.onPath("/claude_code", () => ({ status: 403, body: { secret: "private" } }));
    // when
    const result = enricher().fetchDay(day, { budget: new RequestBudget(2) });
    // then
    await expect(result).rejects.toThrow(/403/u);
  });

  it.each([
    null, [], {}, { data: [], has_more: true },
    { data: [{ ...ClaudeReportBuilder.create().build(), date: "2026-09-24T00:00:00Z" }], has_more: false },
    { data: [{ ...ClaudeReportBuilder.create().build(), actor: { type: "other" } }], has_more: false },
    { data: [{ ...ClaudeReportBuilder.create().build(), actor: { type: "user_actor", email_address: "" } }], has_more: false },
    { data: [{ ...ClaudeReportBuilder.create().build(), model_breakdown: undefined }], has_more: false },
    { data: [{ ...ClaudeReportBuilder.create().build(), model_breakdown: [{ tokens: { input: -1 } }] }], has_more: false },
  ])("should refuse malformed reports without inventing a zero (%j)", (body) => {
    // given
    const parse = () => parseClaudePage(body, day);
    // when / then
    expect(parse).toThrow();
  });
});
