import type { WakaTimeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";

export interface WakaTimeRepository {
  getMemberSummaries(organization: string): Promise<Map<string, WakaTimeMetrics>>;
}
