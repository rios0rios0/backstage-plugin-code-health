import type { LoggerService } from "@backstage/backend-plugin-api";
import type {
  WakaTimeAiMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { normalizeSourceKey } from "../../domain/entities/identity";
import type { Day } from "../../domain/entities/day";
import type { WakaTimeSettings } from "../../domain/entities/ingestion_settings";
import type {
  EnrichmentContext,
  WakaTimeEnricher,
  WakaTimeHarvest,
} from "../../domain/services/snapshot_enricher";
import type { ObservedIdentity } from "../../domain/services/identity_resolver";
import type { ProviderGateway } from "../http/provider_gateway";
import {
  toAiMetrics,
  toBreakdown,
  type WakaTimeDashboardsResponse,
  type WakaTimeDurationsResponse,
  type WakaTimeMembersResponse,
  type WakaTimeSummariesResponse,
  type WakaTimeSummaryDay,
  type WakaTimeUserResponse,
} from "./wakatime_node";

/**
 * Members fetched at a time.
 *
 * The gateway already caps concurrency per host, so this only bounds how many
 * promises are alive at once; a few hundred members would otherwise all be
 * created up front and sit queued, holding their abort listeners.
 */
const MEMBER_BATCH = 5;

/** One person the pass will ask WakaTime about. */
interface WakaTimeSubject {
  /** Path segment used to address them, which is not always the key. */
  readonly path: string;
  readonly identity: ObservedIdentity;
}

const identityOf = (user: {
  username?: string | null;
  display_name?: string | null;
  email?: string | null;
  photo?: string | null;
  id?: string | null;
}): ObservedIdentity | null => {
  // The username is the only field WakaTime guarantees is both present and
  // stable; the id is present but is not what anything human-facing shows, and
  // an account with neither cannot be addressed at all.
  const key = user.username ?? user.id ?? null;
  if (key === null || key === "") return null;

  return {
    source: "wakatime",
    sourceKey: normalizeSourceKey(key),
    displayName: user.display_name ?? user.username ?? null,
    email: user.email ?? null,
    avatarUrl: user.photo ?? null,
    profileUrl: user.username === undefined || user.username === null
      ? null
      : `https://wakatime.com/@${user.username}`,
  };
};

const emptyMetrics = (day: Day): WakaTimeMetrics => ({
  window: { from: day, to: day },
  totalSeconds: 0,
  dailyAverageSeconds: 0,
  activeDays: 0,
  measuredDays: 1,
  bestDay: null,
  daily: [{ day, totalSeconds: 0 }],
  languages: [],
  editors: [],
  projects: [],
  categories: [],
  operatingSystems: [],
  machines: [],
  branches: [],
  filesTouched: null,
  ai: null,
});

/**
 * Turns one day of a WakaTime summaries response into a stored measurement.
 *
 * `entities` is the one list that is absent on some plans, and an absent list
 * is indistinguishable at the wire level from a genuinely empty one. It is
 * therefore reported as unknown rather than as zero files edited by somebody
 * who demonstrably spent the day in an editor.
 */
const toDayMetrics = (day: Day, node: WakaTimeSummaryDay): WakaTimeMetrics => {
  const totalSeconds = Math.round(node.grand_total?.total_seconds ?? 0);

  return {
    window: { from: day, to: day },
    totalSeconds,
    dailyAverageSeconds: totalSeconds,
    activeDays: totalSeconds > 0 ? 1 : 0,
    measuredDays: 1,
    bestDay: totalSeconds > 0 ? { day, totalSeconds } : null,
    daily: [{ day, totalSeconds }],
    languages: toBreakdown(node.languages),
    editors: toBreakdown(node.editors),
    projects: toBreakdown(node.projects),
    categories: toBreakdown(node.categories),
    operatingSystems: toBreakdown(node.operating_systems),
    machines: toBreakdown(node.machines),
    branches: toBreakdown(node.branches),
    filesTouched: node.entities === undefined ? null : node.entities.length,
    ai: null,
  };
};

const withAi = (metrics: WakaTimeMetrics, ai: WakaTimeAiMetrics): WakaTimeMetrics => ({
  ...metrics,
  ai,
});

export interface WakaTimeApiEnricherOptions {
  readonly gateway: ProviderGateway;
  readonly settings: WakaTimeSettings;
  readonly logger: LoggerService;
}

/**
 * Reads coding time, and optionally AI authorship, from WakaTime.
 *
 * The key lives in backend configuration and never reaches a browser, which is
 * the whole reason this moved out of the frontend. It runs on the daily
 * snapshot schedule rather than on every dashboard load, so the cost is one
 * pass a day for the organisation instead of one pass per user per refresh.
 *
 * Two things about WakaTime's API shape drive the code below.
 *
 * 1. **An organisation's members hang off a dashboard, not off the
 *    organisation.** The path is `/users/current/orgs/{org}/dashboards`, then
 *    that dashboard's `/members`, then each member's `/summaries`. There is no
 *    `/orgs/{org}/members`, and asking for one returns a 404 that reads exactly
 *    like a missing organisation.
 * 2. **The AI figures are on a different resource with a different
 *    granularity.** Coding time comes from `summaries`, which takes a start and
 *    an end and answers for the whole span in one request. Token counts and
 *    AI-versus-human line changes come from `durations`, which takes a single
 *    `date`. Collecting the second for a month costs thirty times what the
 *    first does, which is why it is opt-in and why it catches up a few days per
 *    run instead of all at once.
 *
 * With no organisation configured the key's own account is measured instead.
 * That is the useful behaviour on a personal plan, where the alternative is an
 * integration that silently collects nothing.
 */
export class WakaTimeApiEnricher implements WakaTimeEnricher {
  private readonly headers: Record<string, string>;
  private subjects: readonly WakaTimeSubject[] | null = null;

  constructor(private readonly options: WakaTimeApiEnricherOptions) {
    this.headers = {
      Authorization: `Basic ${Buffer.from(options.settings.apiKey ?? "").toString("base64")}`,
    };
  }

  async fetchWindow(input: {
    from: Day;
    to: Day;
    aiDays: readonly Day[];
    context: EnrichmentContext;
  }): Promise<WakaTimeHarvest> {
    const subjects = await this.resolveSubjects(input.context);
    const byDay = new Map<Day, Map<string, WakaTimeMetrics>>();

    for (let index = 0; index < subjects.length; index += MEMBER_BATCH) {
      if (input.context.signal?.aborted) break;

      const batch = subjects.slice(index, index + MEMBER_BATCH);
      const harvested = await Promise.all(
        batch.map((subject) => this.fetchSubject(subject, input)),
      );

      for (const [position, days] of harvested.entries()) {
        const subject = batch[position];
        if (subject === undefined) continue;

        for (const [day, metrics] of days) {
          const bucket = byDay.get(day) ?? new Map<string, WakaTimeMetrics>();
          bucket.set(subject.identity.sourceKey, metrics);
          byDay.set(day, bucket);
        }
      }
    }

    return { identities: subjects.map((subject) => subject.identity), byDay };
  }

  /**
   * The people this pass will ask about, resolved once and kept.
   *
   * Memoised for the life of the enricher rather than re-read per run: the
   * dashboard and its membership change on a human timescale, and re-walking
   * two endpoints every night to learn the same answer is two requests of the
   * budget spent on nothing.
   *
   * Only a non-empty answer is kept. Both resolvers report a failed lookup as
   * an empty list, and latching that would mean one transient 500 on the
   * dashboards call leaves WakaTime collecting nothing at all until the backend
   * process is restarted — with a single warning, days earlier, as the only
   * trace. The argument for memoising is that an *answer* is stable; the
   * absence of one is not an answer.
   */
  private async resolveSubjects(
    context: EnrichmentContext,
  ): Promise<readonly WakaTimeSubject[]> {
    if (this.subjects !== null) return this.subjects;

    const resolved = this.options.settings.organization === null
      ? await this.resolveCurrentUser(context)
      : await this.resolveOrganisationMembers(context);

    if (resolved.length > 0) this.subjects = resolved;
    return resolved;
  }

  private async resolveCurrentUser(
    context: EnrichmentContext,
  ): Promise<readonly WakaTimeSubject[]> {
    try {
      const body = await this.get<WakaTimeUserResponse>("/users/current", context);
      const identity = identityOf(body.data ?? {});
      // `current` addresses the key's own account without another lookup, so it
      // is used as the path even once the username is known.
      return identity === null ? [] : [{ path: "/users/current", identity }];
    } catch (error) {
      this.options.logger.warn(`could not read the WakaTime account: ${String(error)}`);
      return [];
    }
  }

  private async resolveOrganisationMembers(
    context: EnrichmentContext,
  ): Promise<readonly WakaTimeSubject[]> {
    const organization = encodeURIComponent(this.options.settings.organization ?? "");

    try {
      const dashboards = await this.get<WakaTimeDashboardsResponse>(
        `/users/current/orgs/${organization}/dashboards`,
        context,
      );

      const configured = this.options.settings.dashboard;
      const dashboard =
        configured === null
          ? dashboards.data?.[0]
          : dashboards.data?.find(
              (candidate) => candidate.id === configured || candidate.name === configured,
            );

      if (dashboard?.id === undefined) {
        this.options.logger.warn(
          configured === null
            ? `WakaTime organisation ${organization} has no dashboard to read`
            : `WakaTime organisation ${organization} has no dashboard called ${configured}`,
        );
        return [];
      }

      const members = await this.get<WakaTimeMembersResponse>(
        `/users/current/orgs/${organization}/dashboards/${encodeURIComponent(dashboard.id)}/members`,
        context,
      );

      const prefix = `/users/current/orgs/${organization}/dashboards/${encodeURIComponent(dashboard.id)}/members`;

      return (members.data ?? []).flatMap((member) => {
        const identity = identityOf(member.user ?? {});
        // The member id, not the username, addresses the member endpoints — a
        // detail that costs an afternoon when the summaries come back empty for
        // everybody rather than failing outright.
        const memberId = member.id ?? member.user?.id ?? null;
        if (identity === null || memberId === null) return [];
        return [{ path: `${prefix}/${encodeURIComponent(memberId)}`, identity }];
      });
    } catch (error) {
      this.options.logger.warn(`could not list WakaTime members: ${String(error)}`);
      return [];
    }
  }

  private async fetchSubject(
    subject: WakaTimeSubject,
    input: { from: Day; to: Day; aiDays: readonly Day[]; context: EnrichmentContext },
  ): Promise<Map<Day, WakaTimeMetrics>> {
    const days = new Map<Day, WakaTimeMetrics>();

    try {
      const body = await this.get<WakaTimeSummariesResponse>(
        `${subject.path}/summaries?start=${input.from}&end=${input.to}`,
        input.context,
      );

      for (const node of body.data ?? []) {
        const day = node.range?.date;
        if (day === undefined) continue;
        days.set(day, toDayMetrics(day, node));
      }
    } catch (error) {
      // One member's history being unreadable — a revoked seat, a plan that
      // does not cover the requested span — is not a reason to lose everybody
      // else's, so the pass carries on with what it has.
      this.options.logger.debug(
        `no WakaTime summary for ${subject.identity.sourceKey}: ${String(error)}`,
      );
      return days;
    }

    if (input.aiDays.length === 0) return days;

    for (const day of input.aiDays) {
      if (input.context.signal?.aborted) break;

      try {
        const body = await this.get<WakaTimeDurationsResponse>(
          `${subject.path}/durations?date=${day}`,
          input.context,
        );
        const ai = toAiMetrics(body.data ?? []);
        days.set(day, withAi(days.get(day) ?? emptyMetrics(day), ai));
      } catch (error) {
        // Durations are the plan-gated half. Leaving the day's AI figures null
        // says "not collected", which is the truth; writing zeros would say
        // nobody used AI that day, which is a different and false claim.
        this.options.logger.debug(
          `no WakaTime durations for ${subject.identity.sourceKey} on ${day}: ${String(error)}`,
        );
      }
    }

    return days;
  }

  private async get<T>(path: string, context: EnrichmentContext): Promise<T> {
    const response = await this.options.gateway.request(
      {
        url: `${this.options.settings.baseUrl}${path}`,
        headers: this.headers,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      },
      context.budget,
    );

    return JSON.parse(response.body) as T;
  }
}
