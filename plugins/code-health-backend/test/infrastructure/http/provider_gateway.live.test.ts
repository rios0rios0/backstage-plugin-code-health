import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { RequestBudget } from "../../../src/domain/entities/request_budget";
import { ProviderGateway } from "../../../src/infrastructure/http/provider_gateway";
import { ControlledClock } from "../../doubles/controlled_clock";
import { RecordingLogger } from "../../doubles/recording_logger";

/**
 * These exercise the gateway's default transport — the real global `fetch` —
 * against a real server. That is the only way to know the header reads work
 * against actual HTTP semantics rather than against a hand-written double that
 * agrees with the implementation about casing and about what `text()` returns.
 */
type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let handler: Handler = (_request, response) => response.end();

beforeAll(async () => {
  server = createServer((request, response) => handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const createGateway = (clock = new ControlledClock(1_000_000)) => ({
  gateway: new ProviderGateway({
    logger: new RecordingLogger(),
    concurrencyPerHost: 4,
    clock,
  }),
  clock,
});

describe("ProviderGateway against a real server", () => {
  it("should return the body and status of a real response", async () => {
    // given
    handler = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ value: [{ name: "gateway" }] }));
    };
    const { gateway } = createGateway();

    // when
    const result = await gateway.request({ url: `${baseUrl}/repos` }, new RequestBudget(5));

    // then
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ value: [{ name: "gateway" }] });
  });

  it("should read a Retry-After header off a real 200 response", async () => {
    // given
    // Node lowercases incoming header names and `fetch` exposes them
    // case-insensitively; a double that stored them verbatim would let a
    // casing bug through unnoticed.
    let served = 0;
    handler = (_request, response) => {
      served += 1;
      response.writeHead(200, served === 1 ? { "Retry-After": "3" } : {});
      response.end("{}");
    };
    const { gateway, clock } = createGateway();
    const budget = new RequestBudget(5);

    // when
    await gateway.request({ url: `${baseUrl}/first` }, budget);
    await gateway.request({ url: `${baseUrl}/second` }, budget);

    // then
    expect(clock.sleeps).toEqual([3000]);
  });

  it("should retry a real 429 and succeed on the next attempt", async () => {
    // given
    let served = 0;
    handler = (_request, response) => {
      served += 1;
      if (served === 1) {
        response.writeHead(429, { "Retry-After": "1" });
        response.end("slow down");
        return;
      }
      response.writeHead(200);
      response.end("ok");
    };
    const { gateway, clock } = createGateway();

    // when
    const result = await gateway.request({ url: `${baseUrl}/throttled` }, new RequestBudget(5));

    // then
    expect(result.body).toBe("ok");
    expect(clock.sleeps).toEqual([1000]);
    expect(served).toBe(2);
  });

  it("should send a POST body through to the server", async () => {
    // given
    let received = "";
    handler = (request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = Buffer.concat(chunks).toString();
        response.writeHead(200);
        response.end("{}");
      });
    };
    const { gateway } = createGateway();

    // when
    await gateway.request(
      {
        url: `${baseUrl}/graphql`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"query":"{ viewer { login } }"}',
      },
      new RequestBudget(5),
    );

    // then
    expect(received).toBe('{"query":"{ viewer { login } }"}');
  });

  it("should hold concurrent requests to the configured limit", async () => {
    // given
    let inFlight = 0;
    let peak = 0;
    handler = (_request, response) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      setTimeout(() => {
        inFlight -= 1;
        response.writeHead(200);
        response.end("{}");
      }, 20);
    };
    const gateway = new ProviderGateway({
      logger: new RecordingLogger(),
      concurrencyPerHost: 2,
      clock: new ControlledClock(1_000_000),
    });
    const budget = new RequestBudget(20);

    // when
    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        gateway.request({ url: `${baseUrl}/repo-${index}` }, budget),
      ),
    );

    // then
    // Without the cap all eight would land at once, which is exactly the burst
    // that made Azure DevOps start delaying and then rejecting requests.
    expect(peak).toBeLessThanOrEqual(2);
    expect(budget.spent).toBe(8);
  });

  describe("the default clock", () => {
    it("should actually wait when no clock is injected", async () => {
      // given
      // Every other test drives a clock the test controls; this one exercises
      // the real timer, because that is what runs in production and a broken
      // sleep would turn pacing into a busy loop against the provider.
      let served = 0;
      handler = (_request, response) => {
        served += 1;
        response.writeHead(served === 1 ? 429 : 200, { "Retry-After": "1" });
        response.end("{}");
      };
      const gateway = new ProviderGateway({
        logger: new RecordingLogger(),
        concurrencyPerHost: 2,
      });

      // when
      const startedAt = Date.now();
      const result = await gateway.request({ url: `${baseUrl}/slow` }, new RequestBudget(5));
      const elapsed = Date.now() - startedAt;

      // then
      expect(result.status).toBe(200);
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });

    it("should reject a sleep whose signal is already aborted", async () => {
      // given
      const controller = new AbortController();
      controller.abort();
      handler = (_request, response) => {
        response.writeHead(429, { "Retry-After": "5" });
        response.end("{}");
      };
      const gateway = new ProviderGateway({
        logger: new RecordingLogger(),
        concurrencyPerHost: 2,
      });

      // when / then
      // A task that timed out must stop immediately rather than sitting in a
      // provider-requested pause for the next five seconds.
      await expect(
        gateway.request({ url: `${baseUrl}/aborted`, signal: controller.signal }, new RequestBudget(5)),
      ).rejects.toThrow();
    });
  });
});
