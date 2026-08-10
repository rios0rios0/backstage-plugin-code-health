import type { WakaTimeMetrics } from "../entities/wakatime_metrics";

export interface WakaTimeRepository {
  getMemberSummaries(organization: string): Promise<Map<string, WakaTimeMetrics>>;
}
