import type {
  WakaTimeAiMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * Builds the one-day measurement the store actually holds.
 *
 * Anything wider is produced by merging these, so a test that built a wide
 * value directly would be exercising a shape the plugin never writes.
 */
export class WakaTimeMetricsBuilder {
  private day = "2026-08-10";
  private totalSeconds = 0;
  private projects: WakaTimeMetrics["projects"] = [];
  private languages: WakaTimeMetrics["languages"] = [];
  private ai: WakaTimeAiMetrics | null = null;

  static aDay(day = "2026-08-10"): WakaTimeMetricsBuilder {
    const builder = new WakaTimeMetricsBuilder();
    builder.day = day;
    return builder;
  }

  withSeconds(totalSeconds: number): this {
    this.totalSeconds = totalSeconds;
    return this;
  }

  withProject(name: string, totalSeconds: number): this {
    this.projects = [...this.projects, { name, totalSeconds, percent: 100 }];
    return this;
  }

  withLanguage(name: string, totalSeconds: number): this {
    this.languages = [...this.languages, { name, totalSeconds, percent: 100 }];
    return this;
  }

  withAi(overrides: Partial<WakaTimeAiMetrics> = {}): this {
    this.ai = {
      inputTokens: 0,
      outputTokens: 0,
      linesAddedByAi: 0,
      linesDeletedByAi: 0,
      linesAddedByHuman: 0,
      linesDeletedByHuman: 0,
      prompts: 0,
      sessions: 0,
      modelCosts: {},
      daysMeasured: 1,
      ...overrides,
    };
    return this;
  }

  build(): WakaTimeMetrics {
    return {
      window: { from: this.day, to: this.day },
      totalSeconds: this.totalSeconds,
      dailyAverageSeconds: this.totalSeconds,
      activeDays: this.totalSeconds > 0 ? 1 : 0,
      measuredDays: 1,
      bestDay:
        this.totalSeconds > 0 ? { day: this.day, totalSeconds: this.totalSeconds } : null,
      daily: [{ day: this.day, totalSeconds: this.totalSeconds }],
      languages: this.languages,
      editors: [],
      projects: this.projects,
      categories: [],
      operatingSystems: [],
      machines: [],
      branches: [],
      filesTouched: null,
      ai: this.ai,
    };
  }
}
