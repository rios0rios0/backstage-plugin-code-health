import type { LoggerService } from "@backstage/backend-plugin-api";
import {
  CircuitOpenError,
  ProviderRequestError,
} from "../../domain/entities/provider_errors";

// Re-exported so callers of the gateway can catch these without also reaching
// into the domain for the class.
export { CircuitOpenError, ProviderRequestError };
import type { RequestBudget } from "../../domain/entities/request_budget";

export interface GatewayRequest {
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface GatewayResponse {
  readonly status: number;
  readonly body: string;
  header(name: string): string | null;
}

export interface HttpResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<HttpResponseLike>;

export interface GatewayClock {
  now(): number;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

/** Rate-limit signals a provider reported, however they were carried. */
export interface RateLimitSignal {
  readonly remaining?: number;
  readonly limit?: number;
  /** Epoch milliseconds at which the allowance resets. */
  readonly resetAt?: number;
  /** Seconds the provider asked the caller to wait. */
  readonly retryAfterSeconds?: number;
}

export interface ProviderGatewayOptions {
  readonly logger: LoggerService;
  readonly concurrencyPerHost: number;
  readonly fetch?: FetchLike;
  readonly clock?: GatewayClock;
  readonly maxAttempts?: number;
  readonly circuitBreakerThreshold?: number;
  readonly circuitBreakerCooldownMs?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Fraction of the allowance below which the gateway starts slowing itself down.
 * Azure DevOps sends its rate-limit headers *before* it begins delaying, so
 * there is a window in which backing off avoids the delay entirely.
 */
const PACING_THRESHOLD = 0.2;

const DEFAULTS = {
  maxAttempts: 4,
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownMs: 60_000,
  baseBackoffMs: 500,
  maxBackoffMs: 30_000,
};

const defaultClock: GatewayClock = {
  now: () => Date.now(),
  sleep: (milliseconds, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      const onAbort = () => {
        timers.forEach(clearTimeout);
        reject(new Error("aborted"));
      };
      timers.push(
        setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, milliseconds),
      );
      signal?.addEventListener("abort", onAbort, { once: true });
    }),
};

interface HostState {
  inFlight: number;
  queue: Array<() => void>;
  concurrency: number;
  /** Epoch milliseconds before which no request may be sent. */
  pausedUntil: number;
  consecutiveFailures: number;
  circuitOpenUntil: number;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const parseNumber = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Parses `Retry-After`, which RFC 6585 allows to be either a delay in seconds
 * or an HTTP date.
 */
export const parseRetryAfter = (value: string | null, now: number): number | undefined => {
  if (value === null) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);

  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) return undefined;
  return Math.max(0, (asDate - now) / 1000);
};

/**
 * The single door every provider request goes through.
 *
 * It exists because the previous design had none: each dashboard load fanned
 * thousands of unthrottled requests at Azure DevOps and treated the resulting
 * 429s and 5xx as blank cells. Four behaviours here replace that.
 *
 * 1. **A cap on concurrency and on total requests per run**, so load is bounded
 *    by configuration rather than by how many repositories exist.
 * 2. **Pacing from the provider's own signals.** Azure DevOps applies throttling
 *    as latency on a *successful* response — `Retry-After` arrives on HTTP 200,
 *    and the `X-RateLimit-*` headers are sent before any delay starts. Reading
 *    them only on errors, which is the intuitive thing to do, misses the entire
 *    warning.
 * 3. **Retry with jittered exponential backoff** on the statuses worth retrying,
 *    honouring `Retry-After` when the provider named a wait.
 * 4. **A circuit breaker**, so a host that is failing steadily is left alone for
 *    a cooldown instead of being hammered by every subsequent repository.
 */
export class ProviderGateway {
  private readonly hosts = new Map<string, HostState>();
  private readonly fetchImpl: FetchLike;
  private readonly clock: GatewayClock;
  private readonly settings: typeof DEFAULTS;

  constructor(private readonly options: ProviderGatewayOptions) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.clock = options.clock ?? defaultClock;
    this.settings = {
      maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
      circuitBreakerThreshold:
        options.circuitBreakerThreshold ?? DEFAULTS.circuitBreakerThreshold,
      circuitBreakerCooldownMs:
        options.circuitBreakerCooldownMs ?? DEFAULTS.circuitBreakerCooldownMs,
      baseBackoffMs: options.baseBackoffMs ?? DEFAULTS.baseBackoffMs,
      maxBackoffMs: options.maxBackoffMs ?? DEFAULTS.maxBackoffMs,
    };
  }

  /**
   * Records rate-limit information a provider reported somewhere other than the
   * response headers. GitHub's GraphQL API returns its allowance inside the
   * response body, so the collector reads it and hands it back here.
   */
  reportRateLimit(url: string, signal: RateLimitSignal): void {
    this.applyRateLimit(this.stateFor(hostOf(url)), hostOf(url), signal);
  }

  async request(request: GatewayRequest, budget: RequestBudget): Promise<GatewayResponse> {
    const host = hostOf(request.url);
    const state = this.stateFor(host);

    const now = this.clock.now();
    if (state.circuitOpenUntil > now) {
      throw new CircuitOpenError(host, state.circuitOpenUntil);
    }

    await this.acquire(state, request.signal);
    try {
      return await this.attempt(request, budget, state, host);
    } finally {
      this.release(state);
    }
  }

  private stateFor(host: string): HostState {
    const existing = this.hosts.get(host);
    if (existing) return existing;

    const created: HostState = {
      inFlight: 0,
      queue: [],
      concurrency: Math.max(1, this.options.concurrencyPerHost),
      pausedUntil: 0,
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
    };
    this.hosts.set(host, created);
    return created;
  }

  private async acquire(state: HostState, signal?: AbortSignal): Promise<void> {
    if (state.inFlight < state.concurrency) {
      state.inFlight += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      state.queue.push(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
    });
    state.inFlight += 1;
  }

  private release(state: HostState): void {
    state.inFlight -= 1;
    const next = state.queue.shift();
    if (next) next();
  }

  private async attempt(
    request: GatewayRequest,
    budget: RequestBudget,
    state: HostState,
    host: string,
  ): Promise<GatewayResponse> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
      await this.waitForPacing(state, request.signal);

      // A retry is a real request, so it draws on the same allowance. Anything
      // else would let a failing host consume more of the provider than a
      // healthy one.
      budget.consume();

      let response: HttpResponseLike;
      try {
        response = await this.fetchImpl(request.url, {
          method: request.method ?? "GET",
          headers: { Accept: "application/json", ...request.headers },
          ...(request.body === undefined ? {} : { body: request.body }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (request.signal?.aborted) throw lastError;
        this.recordFailure(state, host);
        await this.backoff(attempt, undefined, request.signal);
        continue;
      }

      const body = await response.text();
      const retryAfter = parseRetryAfter(
        response.headers.get("retry-after"),
        this.clock.now(),
      );

      this.applyRateLimit(state, host, {
        remaining: parseNumber(response.headers.get("x-ratelimit-remaining")),
        limit: parseNumber(response.headers.get("x-ratelimit-limit")),
        resetAt: this.resetAtFrom(response.headers.get("x-ratelimit-reset")),
        retryAfterSeconds: retryAfter,
      });

      if (RETRYABLE_STATUSES.has(response.status)) {
        lastError = new ProviderRequestError(response.status, request.url, body);
        this.recordFailure(state, host);
        if (attempt === this.settings.maxAttempts) break;
        await this.backoff(attempt, retryAfter, request.signal);
        continue;
      }

      state.consecutiveFailures = 0;

      if (response.status >= 400) {
        // 4xx other than 429 will not improve on a retry: a wrong path, a
        // revoked token or a repository that no longer exists needs a human,
        // not another request.
        throw new ProviderRequestError(response.status, request.url, body);
      }

      return {
        status: response.status,
        body,
        header: (name: string) => response.headers.get(name),
      };
    }

    throw lastError ?? new Error(`request to ${request.url} failed`);
  }

  private resetAtFrom(header: string | null): number | undefined {
    const seconds = parseNumber(header);
    if (seconds === undefined) return undefined;
    // GitHub sends epoch seconds; Azure DevOps sends the same. A value that
    // small cannot be milliseconds, so treating it as seconds is unambiguous.
    return seconds * 1000;
  }

  private applyRateLimit(state: HostState, host: string, signal: RateLimitSignal): void {
    const now = this.clock.now();

    if (signal.retryAfterSeconds !== undefined && signal.retryAfterSeconds > 0) {
      // Present on successful Azure DevOps responses too, which is the whole
      // point: the provider is asking to be left alone before it starts
      // rejecting anything.
      state.pausedUntil = Math.max(state.pausedUntil, now + signal.retryAfterSeconds * 1000);
      this.options.logger.debug(
        `${host} asked for a ${signal.retryAfterSeconds}s pause; honouring it`,
      );
    }

    if (
      signal.remaining !== undefined &&
      signal.limit !== undefined &&
      signal.limit > 0 &&
      signal.remaining / signal.limit < PACING_THRESHOLD
    ) {
      const previous = state.concurrency;
      state.concurrency = Math.max(1, Math.floor(state.concurrency / 2));
      if (state.concurrency !== previous) {
        this.options.logger.info(
          `${host} is at ${signal.remaining}/${signal.limit} of its allowance; ` +
            `lowering concurrency from ${previous} to ${state.concurrency}`,
        );
      }
      if (signal.resetAt !== undefined && signal.remaining === 0) {
        state.pausedUntil = Math.max(state.pausedUntil, signal.resetAt);
      }
    }
  }

  private recordFailure(state: HostState, host: string): void {
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures < this.settings.circuitBreakerThreshold) return;

    state.circuitOpenUntil = this.clock.now() + this.settings.circuitBreakerCooldownMs;
    state.consecutiveFailures = 0;
    this.options.logger.warn(
      `${host} failed ${this.settings.circuitBreakerThreshold} times in a row; ` +
        `pausing all requests to it for ${this.settings.circuitBreakerCooldownMs}ms`,
    );
  }

  private async waitForPacing(state: HostState, signal?: AbortSignal): Promise<void> {
    const wait = state.pausedUntil - this.clock.now();
    if (wait > 0) await this.clock.sleep(wait, signal);
  }

  private async backoff(
    attempt: number,
    retryAfterSeconds: number | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    if (retryAfterSeconds !== undefined) {
      await this.clock.sleep(retryAfterSeconds * 1000, signal);
      return;
    }

    const ceiling = Math.min(
      this.settings.maxBackoffMs,
      this.settings.baseBackoffMs * 2 ** (attempt - 1),
    );
    // Full jitter: a uniform draw over the whole window rather than the window
    // itself, so repositories that failed together do not retry together.
    await this.clock.sleep(Math.floor(Math.random() * ceiling), signal);
  }
}
