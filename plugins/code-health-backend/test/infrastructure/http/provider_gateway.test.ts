import { BudgetExhaustedError, RequestBudget } from "../../../src/domain/entities/request_budget";
import {
  CircuitOpenError,
  parseRetryAfter,
  ProviderGateway,
  ProviderRequestError,
} from "../../../src/infrastructure/http/provider_gateway";
import { ControlledClock } from "../../doubles/controlled_clock";
import { RecordingLogger } from "../../doubles/recording_logger";
import { ScriptedFetch } from "../../doubles/scripted_fetch";

const URL_A = "https://dev.azure.com/example-org/_apis/git/repositories";
const URL_B = "https://dev.azure.com/example-org/_apis/build/builds";

const createGateway = (
  transport: ScriptedFetch,
  clock = new ControlledClock(1_000_000),
  overrides: Partial<ConstructorParameters<typeof ProviderGateway>[0]> = {},
) => {
  const logger = new RecordingLogger();
  const gateway = new ProviderGateway({
    logger,
    concurrencyPerHost: 4,
    fetch: transport.fetch,
    clock,
    ...overrides,
  });
  return { gateway, logger, clock };
};

describe("ProviderGateway", () => {
  describe("budget", () => {
    it("should stop the run once the allowance is spent", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 200, body: "{}" },
        { status: 200, body: "{}" },
      );
      const { gateway } = createGateway(transport);
      const budget = new RequestBudget(1);

      // when
      await gateway.request({ url: URL_A }, budget);

      // then
      // Bounding work per run rather than per repository is what keeps the load
      // independent of how many repositories the catalog holds.
      await expect(gateway.request({ url: URL_B }, budget)).rejects.toThrow(BudgetExhaustedError);
      expect(transport.calls).toHaveLength(1);
    });

    it("should charge retries against the same allowance", async () => {
      // given
      // A failing host must not be granted more of the provider than a healthy
      // one, so a retry costs exactly what a first attempt costs.
      const transport = new ScriptedFetch().withReplies(
        { status: 503 },
        { status: 503 },
        { status: 200, body: "{}" },
      );
      const { gateway } = createGateway(transport);
      const budget = new RequestBudget(10);

      // when
      await gateway.request({ url: URL_A }, budget);

      // then
      expect(budget.spent).toBe(3);
    });
  });

  describe("retries", () => {
    it.each([429, 500, 502, 503, 504])("should retry a %i response", async (status) => {
      // given
      const transport = new ScriptedFetch().withReplies({ status }, { status: 200, body: "ok" });
      const { gateway } = createGateway(transport);

      // when
      const response = await gateway.request({ url: URL_A }, new RequestBudget(10));

      // then
      expect(response.status).toBe(200);
      expect(response.body).toBe("ok");
    });

    it("should retry a transport failure", async () => {
      // given
      const transport = new ScriptedFetch()
        .withNetworkFailure()
        .withReplies({ status: 200, body: "ok" });
      const { gateway } = createGateway(transport);

      // when
      const response = await gateway.request({ url: URL_A }, new RequestBudget(10));

      // then
      expect(response.status).toBe(200);
    });

    it("should give up after the configured number of attempts", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 503 },
        { status: 503 },
        { status: 503 },
      );
      const { gateway } = createGateway(transport, new ControlledClock(1_000_000), {
        maxAttempts: 3,
      });

      // when / then
      await expect(gateway.request({ url: URL_A }, new RequestBudget(10))).rejects.toThrow(
        ProviderRequestError,
      );
      expect(transport.calls).toHaveLength(3);
    });

    it("should back off further on each attempt", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 503 },
        { status: 503 },
        { status: 200, body: "ok" },
      );
      const clock = new ControlledClock(1_000_000);
      const { gateway } = createGateway(transport, clock, { baseBackoffMs: 1000 });

      // when
      await gateway.request({ url: URL_A }, new RequestBudget(10));

      // then
      // Full jitter draws uniformly over a widening window, so repositories
      // that failed together do not all retry at the same instant.
      expect(clock.sleeps).toHaveLength(2);
      expect(clock.sleeps[0]).toBeLessThan(1000);
      expect(clock.sleeps[1]).toBeLessThan(2000);
    });

    it("should not retry a 404", async () => {
      // given
      // A missing repository or a revoked token will not improve on a retry;
      // spending the budget on one only delays the error.
      const transport = new ScriptedFetch().withReplies({ status: 404, body: "gone" });
      const { gateway } = createGateway(transport);

      // when / then
      await expect(gateway.request({ url: URL_A }, new RequestBudget(10))).rejects.toThrow(
        ProviderRequestError,
      );
      expect(transport.calls).toHaveLength(1);
    });

    it("should carry the status and body on a non-retryable failure", async () => {
      // given
      const transport = new ScriptedFetch().withReplies({ status: 403, body: "forbidden" });
      const { gateway } = createGateway(transport);

      // when
      const error = await gateway
        .request({ url: URL_A }, new RequestBudget(10))
        .catch((thrown: unknown) => thrown as ProviderRequestError);

      // then
      expect(error.status).toBe(403);
      expect(error.body).toBe("forbidden");
    });
  });

  describe("rate limiting", () => {
    it("should honour Retry-After on a successful response", async () => {
      // given
      // Azure DevOps applies throttling as latency on HTTP 200 rather than as
      // an error, so a client that reads Retry-After only on failures misses
      // the entire warning and keeps pushing until it is blocked outright.
      const transport = new ScriptedFetch().withReplies(
        { status: 200, body: "ok", headers: { "Retry-After": "5" } },
        { status: 200, body: "ok" },
      );
      const clock = new ControlledClock(1_000_000);
      const { gateway } = createGateway(transport, clock);
      const budget = new RequestBudget(10);

      // when
      await gateway.request({ url: URL_A }, budget);
      await gateway.request({ url: URL_B }, budget);

      // then
      expect(clock.sleeps).toEqual([5000]);
    });

    it("should honour a Retry-After given as an HTTP date", async () => {
      // given
      const clock = new ControlledClock(Date.parse("2026-08-10T12:00:00.000Z"));
      const transport = new ScriptedFetch().withReplies(
        {
          status: 200,
          body: "ok",
          headers: { "Retry-After": "Mon, 10 Aug 2026 12:00:30 GMT" },
        },
        { status: 200, body: "ok" },
      );
      const { gateway } = createGateway(transport, clock);
      const budget = new RequestBudget(10);

      // when
      await gateway.request({ url: URL_A }, budget);
      await gateway.request({ url: URL_B }, budget);

      // then
      expect(clock.sleeps).toEqual([30_000]);
    });

    it("should lower concurrency when the allowance runs low", async () => {
      // given
      const transport = new ScriptedFetch().withReplies({
        status: 200,
        body: "ok",
        headers: { "X-RateLimit-Remaining": "10", "X-RateLimit-Limit": "200" },
      });
      const { gateway, logger } = createGateway(transport);

      // when
      await gateway.request({ url: URL_A }, new RequestBudget(10));

      // then
      expect(logger.at("info").join(" ")).toContain("lowering concurrency from 4 to 2");
    });

    it("should leave concurrency alone while the allowance is healthy", async () => {
      // given
      const transport = new ScriptedFetch().withReplies({
        status: 200,
        body: "ok",
        headers: { "X-RateLimit-Remaining": "180", "X-RateLimit-Limit": "200" },
      });
      const { gateway, logger } = createGateway(transport);

      // when
      await gateway.request({ url: URL_A }, new RequestBudget(10));

      // then
      expect(logger.at("info")).toEqual([]);
    });

    it("should wait for the reset once the allowance is gone", async () => {
      // given
      const clock = new ControlledClock(1_000_000);
      const transport = new ScriptedFetch().withReplies(
        {
          status: 200,
          body: "ok",
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Limit": "200",
            "X-RateLimit-Reset": String((1_000_000 + 20_000) / 1000),
          },
        },
        { status: 200, body: "ok" },
      );
      const { gateway } = createGateway(transport, clock);
      const budget = new RequestBudget(10);

      // when
      await gateway.request({ url: URL_A }, budget);
      await gateway.request({ url: URL_B }, budget);

      // then
      expect(clock.sleeps).toEqual([20_000]);
    });

    it("should accept a rate limit the provider reported in the response body", async () => {
      // given
      // GitHub's GraphQL API returns its allowance inside the payload, so the
      // collector reads it and hands it back rather than the gateway guessing.
      const transport = new ScriptedFetch().withReplies({ status: 200, body: "ok" });
      const clock = new ControlledClock(1_000_000);
      const { gateway } = createGateway(transport, clock);

      // when
      gateway.reportRateLimit("https://api.github.com/graphql", {
        remaining: 0,
        limit: 5000,
        resetAt: 1_000_000 + 15_000,
      });
      await gateway.request({ url: "https://api.github.com/graphql" }, new RequestBudget(10));

      // then
      expect(clock.sleeps).toEqual([15_000]);
    });

    it("should keep pacing separate per host", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 200, body: "ok", headers: { "Retry-After": "5" } },
        { status: 200, body: "ok" },
      );
      const clock = new ControlledClock(1_000_000);
      const { gateway } = createGateway(transport, clock);
      const budget = new RequestBudget(10);

      // when
      await gateway.request({ url: URL_A }, budget);
      await gateway.request({ url: "https://api.github.com/graphql" }, budget);

      // then
      // One throttled provider must not slow the other down; they have separate
      // allowances and separate operators.
      expect(clock.sleeps).toEqual([]);
    });
  });

  describe("circuit breaker", () => {
    it("should stop calling a host that keeps failing", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 503 },
        { status: 503 },
        { status: 503 },
      );
      const { gateway, logger } = createGateway(transport, new ControlledClock(1_000_000), {
        maxAttempts: 3,
        circuitBreakerThreshold: 3,
      });

      // when
      await gateway.request({ url: URL_A }, new RequestBudget(10)).catch(() => undefined);

      // then
      await expect(gateway.request({ url: URL_B }, new RequestBudget(10))).rejects.toThrow(
        CircuitOpenError,
      );
      expect(logger.at("warn").join(" ")).toContain("failed 3 times in a row");
    });

    it("should call the host again once the cooldown has passed", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 200, body: "ok" },
      );
      const clock = new ControlledClock(1_000_000);
      const { gateway } = createGateway(transport, clock, {
        maxAttempts: 3,
        circuitBreakerThreshold: 3,
        circuitBreakerCooldownMs: 60_000,
      });
      await gateway.request({ url: URL_A }, new RequestBudget(10)).catch(() => undefined);

      // when
      clock.advance(60_001);
      const response = await gateway.request({ url: URL_B }, new RequestBudget(10));

      // then
      expect(response.status).toBe(200);
    });

    it("should forget earlier failures once a request succeeds", async () => {
      // given
      const transport = new ScriptedFetch().withReplies(
        { status: 503 },
        { status: 200, body: "ok" },
        { status: 503 },
        { status: 200, body: "ok" },
      );
      const { gateway } = createGateway(transport, new ControlledClock(1_000_000), {
        circuitBreakerThreshold: 3,
      });
      const budget = new RequestBudget(10);

      // when
      await gateway.request({ url: URL_A }, budget);
      const response = await gateway.request({ url: URL_B }, budget);

      // then
      // Otherwise an intermittently flaky host would eventually trip the breaker
      // through failures spread across hours.
      expect(response.status).toBe(200);
    });
  });

  describe("request shaping", () => {
    it("should send the supplied method, headers and body", async () => {
      // given
      const transport = new ScriptedFetch().withReplies({ status: 200, body: "ok" });
      const { gateway } = createGateway(transport);

      // when
      await gateway.request(
        {
          url: "https://api.github.com/graphql",
          method: "POST",
          headers: { Authorization: "Bearer fixture-token-placeholder" },
          body: '{"query":"{ viewer { login } }"}',
        },
        new RequestBudget(10),
      );

      // then
      expect(transport.calls[0]).toMatchObject({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer fixture-token-placeholder",
        },
        body: '{"query":"{ viewer { login } }"}',
      });
    });

    it("should expose response headers to the caller", async () => {
      // given
      const transport = new ScriptedFetch().withReplies({
        status: 200,
        body: "ok",
        headers: { "x-ms-continuationtoken": "abc" },
      });
      const { gateway } = createGateway(transport);

      // when
      const response = await gateway.request({ url: URL_A }, new RequestBudget(10));

      // then
      // Azure DevOps paginates builds through a continuation token that only
      // appears in a header, so collectors have to be able to read one.
      expect(response.header("x-ms-continuationtoken")).toBe("abc");
    });

    it("should surface an abort rather than retrying it", async () => {
      // given
      const controller = new AbortController();
      const transport = new ScriptedFetch().withNetworkFailure("aborted");
      const { gateway } = createGateway(transport);
      controller.abort();

      // when / then
      await expect(
        gateway.request({ url: URL_A, signal: controller.signal }, new RequestBudget(10)),
      ).rejects.toThrow("aborted");
      expect(transport.calls).toHaveLength(1);
    });
  });
});

describe("parseRetryAfter", () => {
  it("should read a delay in seconds", () => {
    // given / when
    const result = parseRetryAfter("30", 0);

    // then
    expect(result).toBe(30);
  });

  it("should read an HTTP date as a delay from now", () => {
    // given
    const now = Date.parse("2026-08-10T12:00:00.000Z");

    // when
    const result = parseRetryAfter("Mon, 10 Aug 2026 12:00:45 GMT", now);

    // then
    expect(result).toBe(45);
  });

  it("should clamp a date already in the past to zero", () => {
    // given
    const now = Date.parse("2026-08-10T12:00:00.000Z");

    // when
    const result = parseRetryAfter("Mon, 10 Aug 2026 11:59:00 GMT", now);

    // then
    expect(result).toBe(0);
  });

  it("should ignore a header that is neither a number nor a date", () => {
    // given / when
    const result = parseRetryAfter("soon", 0);

    // then
    expect(result).toBeUndefined();
  });

  it("should ignore an absent header", () => {
    // given / when
    const result = parseRetryAfter(null, 0);

    // then
    expect(result).toBeUndefined();
  });
});
