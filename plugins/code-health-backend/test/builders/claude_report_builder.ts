/** Provider-shaped fixture, deliberately distinct from the domain metrics. */
export class ClaudeReportBuilder {
  private day = "2026-09-25";
  private actor = { type: "user_actor", email_address: "Dev@Example.com" } as Record<string, string>;
  static create(): ClaudeReportBuilder { return new ClaudeReportBuilder(); }
  on(day: string): this { this.day = day; return this; }
  asApiKey(name: string): this { this.actor = { type: "api_actor", api_key_name: name }; return this; }
  build() {
    return {
      date: `${this.day}T00:00:00Z`, actor: this.actor,
      model_breakdown: [{ model: "model-a", tokens: { input: 100, output: 20, cache_read: 60, cache_creation: 10 } }],
    };
  }
}
