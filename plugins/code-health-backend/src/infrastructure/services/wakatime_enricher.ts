import type { LoggerService } from "@backstage/backend-plugin-api";
import type { WakaTimeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { WakaTimeSettings } from "../../domain/entities/ingestion_settings";
import type {
  EnrichmentContext,
  WakaTimeEnricher,
} from "../../domain/services/snapshot_enricher";
import type { ProviderGateway } from "../http/provider_gateway";

interface WakaTimeMemberNode {
  readonly user?: {
    readonly username?: string;
    readonly email?: string;
    readonly display_name?: string;
  };
}

interface WakaTimeSummaryNode {
  readonly cumulative_total?: { readonly seconds?: number };
  readonly daily_average?: { readonly seconds?: number };
}

interface WakaTimeMembersResponse {
  readonly data?: readonly WakaTimeMemberNode[];
}

const MEMBER_BATCH = 5;

/**
 * Reads WakaTime coding time for an organisation's members.
 *
 * The key lives in backend configuration and never reaches a browser, which is
 * the whole reason this moved out of the frontend. It runs on the daily
 * snapshot schedule rather than on every dashboard load, so the cost is one
 * pass a day for the organisation instead of one pass per user per refresh.
 */
export class WakaTimeApiEnricher implements WakaTimeEnricher {
  constructor(
    private readonly options: {
      readonly gateway: ProviderGateway;
      readonly settings: WakaTimeSettings;
      readonly logger: LoggerService;
    },
  ) {}

  async fetchAll(context: EnrichmentContext): Promise<ReadonlyMap<string, WakaTimeMetrics>> {
    const { organization, apiKey, baseUrl } = this.options.settings;
    if (!organization || !apiKey) return new Map();

    const headers = { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}` };

    let members: readonly WakaTimeMemberNode[];
    try {
      const response = await this.options.gateway.request(
        {
          url: `${baseUrl}/orgs/${encodeURIComponent(organization)}/members`,
          headers,
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        },
        context.budget,
      );
      members = (JSON.parse(response.body) as WakaTimeMembersResponse).data ?? [];
    } catch (error) {
      this.options.logger.warn(`could not list WakaTime members: ${String(error)}`);
      return new Map();
    }

    const result = new Map<string, WakaTimeMetrics>();

    for (let index = 0; index < members.length; index += MEMBER_BATCH) {
      const batch = members.slice(index, index + MEMBER_BATCH);
      const summaries = await Promise.all(
        batch.map((member) => this.fetchMember(member, headers, context)),
      );
      for (const summary of summaries) {
        if (summary) result.set(summary.key, summary.metrics);
      }
    }

    return result;
  }

  private async fetchMember(
    member: WakaTimeMemberNode,
    headers: Record<string, string>,
    context: EnrichmentContext,
  ): Promise<{ key: string; metrics: WakaTimeMetrics } | null> {
    const username = member.user?.username;
    if (!username) return null;

    // Keyed on the e-mail where there is one, matching how commit authors are
    // identified, so the two can be joined on the same contributor row.
    const key = (member.user?.email ?? username).toLowerCase();

    try {
      const response = await this.options.gateway.request(
        {
          url: `${this.options.settings.baseUrl}/users/${encodeURIComponent(username)}/summaries?range=last_30_days`,
          headers,
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        },
        context.budget,
      );
      const body = JSON.parse(response.body) as WakaTimeSummaryNode;

      return {
        key,
        metrics: {
          totalSeconds: Math.round(body.cumulative_total?.seconds ?? 0),
          dailyAverageSeconds: Math.round(body.daily_average?.seconds ?? 0),
        },
      };
    } catch (error) {
      this.options.logger.debug(`no WakaTime summary for ${username}: ${String(error)}`);
      return null;
    }
  }
}
