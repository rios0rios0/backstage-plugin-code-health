import type { ClaudeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import { CollectClaudeUsage } from "../../../src/domain/commands/collect_claude_usage";
import { ListContributorSummaries } from "../../../src/domain/commands/list_contributor_summaries";
import { GetContributorTrend } from "../../../src/domain/commands/get_contributor_trend";
import { RequestBudget } from "../../../src/domain/entities/request_budget";
import type { ClaudeEnricher, ClaudeHarvest } from "../../../src/domain/services/claude_enricher";
import type { EnrichmentContext } from "../../../src/domain/services/snapshot_enricher";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { RecordingIdentityObserver } from "../../doubles/recording_identity_observer";
import { RecordingLogger } from "../../doubles/recording_logger";

const now = new Date("2026-09-25T12:00:00Z");
const counts = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 60, cacheCreationTokens: 10 };
const metricsOn = (day: string): ClaudeMetrics => ({ ...counts, daily: [{ day, ...counts }] });
class DailyClaudeReports implements ClaudeEnricher {
  readonly days: string[] = [];
  async fetchDay(day: string, context: EnrichmentContext): Promise<ClaudeHarvest> {
    context.budget.consume();
    this.days.push(day);
    return { identities: [], metrics: new Map([["dev@example.com", metricsOn(day)]]) };
  }
}
const setup = () => {
  const store = new InMemoryCodeHealthStore();
  const enricher = new DailyClaudeReports();
  const identities = new RecordingIdentityObserver();
  const logger = new RecordingLogger();
  const command = new CollectClaudeUsage({ store, enricher, identities, logger, historyDays: 3 });
  return { store, enricher, identities, logger, command };
};

describe("Claude usage collection and reads", () => {
  it("should resume missing history before refreshing recent reports without double counting", async () => {
    // given
    const { command, store, enricher, logger } = setup();
    await command.run(now, { budget: new RequestBudget(1) });
    // when
    await command.run(now, { budget: new RequestBudget(5) });
    // then
    expect(enricher.days).toEqual(["2026-09-25", "2026-09-24", "2026-09-23", "2026-09-25"]);
    const rows = await store.listContributorMetrics<ClaudeMetrics>({ source: "claude", from: "2026-09-23", to: "2026-09-25" });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.payload.inputTokens === 100)).toBe(true);
    expect(logger.at("warn")).toHaveLength(1);
  });

  it("should stop before collecting anything when cancelled", async () => {
    // given
    const { command, enricher } = setup();
    const controller = new AbortController();
    controller.abort();
    // when
    await command.run(now, { budget: new RequestBudget(10), signal: controller.signal });
    // then
    expect(enricher.days).toEqual([]);
  });

  it("should merge linked Claude accounts retroactively and honor person-wide exclusions", async () => {
    // given
    const { store, command } = setup();
    await command.run(now, { budget: new RequestBudget(10) });
    const query = new ListContributorSummaries({ store });
    const window = { from: new Date("2026-09-23T00:00:00Z"), to: new Date("2026-09-25T00:00:00Z") };
    const unlinked = await query.run(window);
    await store.saveIdentityLink({ source: "claude", sourceKey: "dev@example.com", entityRef: "user:default/dev", origin: "manual", linkedBy: null, linkedAt: now });
    await store.saveContributorMetrics({ source: "claude", day: "2026-09-24", capturedAt: now, metrics: new Map([["second@example.com", metricsOn("2026-09-24")]]) });
    await store.saveIdentityLink({ source: "claude", sourceKey: "second@example.com", entityRef: "user:default/dev", origin: "manual", linkedBy: null, linkedAt: now });
    // when
    const linked = await query.run(window);
    const trend = await new GetContributorTrend({ store }).run({ ...window, key: "user:default/dev", bucket: "day" });
    await store.saveIdentityExclusion({ source: "claude", sourceKey: "second@example.com", reason: "automated-bot", excludedBy: null, excludedAt: now });
    const excluded = await query.run(window);
    // then
    expect(unlinked[0].key).toBe("claude:dev@example.com");
    expect(unlinked[0].claudeMetrics?.inputTokens).toBe(200);
    expect(linked).toHaveLength(1);
    expect(linked[0].key).toBe("user:default/dev");
    expect(linked[0].claudeMetrics?.inputTokens).toBe(300);
    expect(trend.points.map((point) => point.summary.claudeMetrics?.inputTokens)).toEqual([100, 200]);
    expect(trend.summary?.claudeMetrics).toEqual(linked[0].claudeMetrics);
    expect(excluded).toEqual([]);
    expect(await query.run({ ...window, repositoryId: "unrelated" })).toEqual([]);
  });
});
