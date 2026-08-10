import type { WakaTimeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { WakaTimeRepository } from "../../src/domain/repositories/wakatime_repository";

export class StubWakaTimeRepository implements WakaTimeRepository {
  private summaries: Map<string, WakaTimeMetrics> = new Map();

  withSummary(username: string, metrics: WakaTimeMetrics): this {
    this.summaries.set(username, metrics);
    return this;
  }

  async getMemberSummaries(_organization: string): Promise<Map<string, WakaTimeMetrics>> {
    return this.summaries;
  }
}
