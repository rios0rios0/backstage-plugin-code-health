import type { WakaTimeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { WakaTimeRepository } from "../../domain/repositories/wakatime_repository";
import type { WakaTimeClient } from "../http/wakatime_client";

const BATCH_SIZE = 5;

interface WakaTimeMember {
  user: { username: string; display_name: string; email: string };
}

interface WakaTimeMembersResponse {
  data: WakaTimeMember[];
}

interface WakaTimeSummaryDay {
  grand_total: { total_seconds: number };
}

interface WakaTimeSummariesResponse {
  data: WakaTimeSummaryDay[];
}

export class WakaTimeRepositoryImpl implements WakaTimeRepository {
  private readonly client: WakaTimeClient;
  private readonly token: string;

  constructor(client: WakaTimeClient, token: string) {
    this.client = client;
    this.token = token;
  }

  async getMemberSummaries(organization: string): Promise<Map<string, WakaTimeMetrics>> {
    const result = new Map<string, WakaTimeMetrics>();

    let members: WakaTimeMember[];
    try {
      const response = await this.client.get<WakaTimeMembersResponse>(
        this.token,
        `/orgs/${encodeURIComponent(organization)}/members`,
      );
      members = response.data;
    } catch {
      return result;
    }

    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE);
      const summaries = await Promise.all(
        batch.map(async (member) => {
          try {
            const response = await this.client.get<WakaTimeSummariesResponse>(
              this.token,
              `/users/${encodeURIComponent(member.user.username)}/summaries?range=last_30_days`,
            );
            const totalSeconds = response.data.reduce(
              (sum, day) => sum + day.grand_total.total_seconds,
              0,
            );
            const days = response.data.length || 1;
            return {
              username: member.user.display_name || member.user.username,
              email: member.user.email,
              metrics: {
                totalSeconds,
                dailyAverageSeconds: Math.round(totalSeconds / days),
              } satisfies WakaTimeMetrics,
            };
          } catch {
            return null;
          }
        }),
      );

      for (const summary of summaries) {
        if (summary) {
          result.set(summary.username, summary.metrics);
          if (summary.email) {
            result.set(summary.email, summary.metrics);
          }
        }
      }
    }

    return result;
  }
}

export class NoOpWakaTimeRepository implements WakaTimeRepository {
  async getMemberSummaries(_organization: string): Promise<Map<string, WakaTimeMetrics>> {
    return new Map();
  }
}
