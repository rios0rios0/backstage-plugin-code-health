import type { LoggerService } from "@backstage/backend-plugin-api";
import type { AtlassianSettings } from "../../../domain/entities/ingestion_settings";
import type { EnrichmentContext } from "../../../domain/services/snapshot_enricher";
import type { ProviderGateway } from "../../http/provider_gateway";

export type { AtlassianSettings };

/** Raised when a resource the site does not serve was asked for. */
export class AtlassianNotAvailableError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Atlassian returned ${status} for ${path}`);
    this.name = "AtlassianNotAvailableError";
  }
}

export interface AtlassianPage<TItem> {
  readonly items: readonly TItem[];
  /** Cursor for the next page, or null when the walk is finished. */
  readonly next: string | null;
}

export interface AtlassianClientOptions {
  readonly gateway: ProviderGateway;
  readonly settings: AtlassianSettings;
  readonly logger: LoggerService;
}

/**
 * The single authenticated door to one Atlassian Cloud site.
 *
 * Jira and Confluence live on the same host, behind the same credential, under
 * the same per-site rate limit — so they go through one client over the shared
 * {@link ProviderGateway}. That is not tidiness: the gateway's pacing,
 * concurrency cap and circuit breaker are all keyed by host, and two clients
 * would each believe they had the whole allowance while the site counted the
 * sum.
 *
 * Authentication is HTTP Basic over `email:apiToken`, which is what Atlassian
 * Cloud's REST APIs accept for a user-scoped token. Nothing here ever reaches a
 * browser: the token is read from backend configuration and every request is
 * made by a scheduled task.
 */
export class AtlassianClient {
  private readonly authorization: string;

  constructor(private readonly options: AtlassianClientOptions) {
    const { email, apiToken } = options.settings;
    this.authorization = `Basic ${Buffer.from(`${email ?? ""}:${apiToken ?? ""}`).toString("base64")}`;
  }

  get maxResultsPerRun(): number {
    return this.options.settings.maxResultsPerRun;
  }

  async get<T>(path: string, context: EnrichmentContext): Promise<T> {
    return this.send<T>("GET", path, undefined, context);
  }

  async post<T>(path: string, body: unknown, context: EnrichmentContext): Promise<T> {
    return this.send<T>("POST", path, JSON.stringify(body), context);
  }

  private async send<T>(
    method: "GET" | "POST",
    path: string,
    body: string | undefined,
    context: EnrichmentContext,
  ): Promise<T> {
    const { baseUrl } = this.options.settings;
    if (baseUrl === null) {
      throw new AtlassianNotAvailableError(0, path);
    }

    const response = await this.options.gateway.request(
      {
        url: `${baseUrl}${path}`,
        method,
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      },
      context.budget,
    );

    return JSON.parse(response.body) as T;
  }

  /**
   * Walks a paginated resource until the provider says there is no next page or
   * the run's ceiling is reached.
   *
   * The ceiling is not a nicety. Both products page indefinitely, and a site
   * with a decade of history would otherwise spend an entire request budget on
   * one resource and starve everything the run was also meant to collect. When
   * it bites, what came back is returned rather than thrown away — a partial
   * window is a real measurement of its own days.
   */
  async paginate<TItem>(options: {
    readonly context: EnrichmentContext;
    readonly fetchPage: (cursor: string | null) => Promise<AtlassianPage<TItem>>;
    readonly limit?: number;
  }): Promise<TItem[]> {
    const limit = options.limit ?? this.maxResultsPerRun;
    const collected: TItem[] = [];
    let cursor: string | null = null;

    do {
      if (options.context.signal?.aborted) break;

      const page: AtlassianPage<TItem> = await options.fetchPage(cursor);
      collected.push(...page.items);
      cursor = page.next;

      // A page that returns nothing while still offering a cursor would spin
      // for as long as the budget lasts. Both products do it at the end of some
      // resources, so the empty page is the terminator rather than the cursor.
      if (page.items.length === 0) return collected;

      if (collected.length >= limit) {
        if (cursor !== null) {
          this.options.logger.info(
            `stopped paginating at ${collected.length} results; raise ` +
              `codeHealth.atlassian.maxResultsPerRun to collect the rest`,
          );
        }
        return collected.slice(0, limit);
      }
    } while (cursor !== null && cursor !== "");

    return collected;
  }
}
