import type {
  WakaTimeAiMetrics,
  WakaTimeDayTotal,
  WakaTimeMetrics,
} from "../../src/wakatime_metrics";

/**
 * Builds a measurement for one day, which is the shape the store actually
 * holds. Anything wider is produced by merging these, so a test that builds a
 * wide value directly would be exercising a value the plugin never creates.
 */
export class WakaTimeMetricsBuilder {
  private day = "2026-08-10";
  private totalSeconds = 0;
  private languages: WakaTimeMetrics["languages"] = [];
  private editors: WakaTimeMetrics["editors"] = [];
  private projects: WakaTimeMetrics["projects"] = [];
  private branches: WakaTimeMetrics["branches"] = [];
  private filesTouched: number | null = null;
  private ai: WakaTimeAiMetrics | null = null;

  static aDay(): WakaTimeMetricsBuilder {
    return new WakaTimeMetricsBuilder();
  }

  onDay(day: string): this {
    this.day = day;
    return this;
  }

  withSeconds(totalSeconds: number): this {
    this.totalSeconds = totalSeconds;
    return this;
  }

  withLanguage(name: string, totalSeconds: number): this {
    this.languages = [...this.languages, { name, totalSeconds, percent: 100 }];
    return this;
  }

  withEditor(name: string, totalSeconds: number): this {
    this.editors = [...this.editors, { name, totalSeconds, percent: 100 }];
    return this;
  }

  withProject(name: string, totalSeconds: number): this {
    this.projects = [...this.projects, { name, totalSeconds, percent: 100 }];
    return this;
  }

  withBranch(name: string, totalSeconds: number): this {
    this.branches = [...this.branches, { name, totalSeconds, percent: 100 }];
    return this;
  }

  withFilesTouched(filesTouched: number | null): this {
    this.filesTouched = filesTouched;
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
    const daily: WakaTimeDayTotal[] = [
      { day: this.day, totalSeconds: this.totalSeconds },
    ];

    return {
      window: { from: this.day, to: this.day },
      totalSeconds: this.totalSeconds,
      dailyAverageSeconds: this.totalSeconds,
      activeDays: this.totalSeconds > 0 ? 1 : 0,
      measuredDays: 1,
      bestDay: this.totalSeconds > 0 ? { day: this.day, totalSeconds: this.totalSeconds } : null,
      daily,
      languages: this.languages,
      editors: this.editors,
      projects: this.projects,
      categories: [],
      operatingSystems: [],
      machines: [],
      branches: this.branches,
      filesTouched: this.filesTouched,
      ai: this.ai,
    };
  }
}
