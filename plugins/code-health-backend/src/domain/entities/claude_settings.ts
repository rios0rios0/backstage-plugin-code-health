export interface ClaudeSettings {
  readonly enabled: boolean;
  readonly apiKey: string | null;
  readonly historyDays: number;
  readonly requestBudgetPerRun: number;
}

export const isClaudeConfigured = (settings: ClaudeSettings): boolean =>
  settings.enabled && settings.apiKey !== null && settings.apiKey.trim() !== "";
