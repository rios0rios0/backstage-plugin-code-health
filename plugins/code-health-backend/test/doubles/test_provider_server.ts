import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

type Route = (request: RecordedRequest) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined;

/**
 * A real HTTP server the test controls, standing in for a provider.
 *
 * Collectors are tested against this rather than against a transport double so
 * the query strings they build are actually parsed by an HTTP stack. That is
 * the layer where the interesting mistakes live — a missing `queryOrder`, a
 * `status` left at its default — and a double that echoed back whatever the
 * collector sent would agree with the bug.
 */
export class TestProviderServer {
  private server?: Server;
  private routes: Route[] = [];

  readonly requests: RecordedRequest[] = [];

  baseUrl = "";

  async start(): Promise<void> {
    this.server = createServer((request, response) => this.handle(request, response));
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = undefined;
  }

  reset(): void {
    this.routes = [];
    this.requests.length = 0;
  }

  /** Registers a responder. The first one to return a result answers. */
  route(handler: Route): TestProviderServer {
    this.routes = [...this.routes, handler];
    return this;
  }

  /**
   * Answers any request whose path *ends* with `suffix`.
   *
   * Needed wherever one endpoint's path is a prefix of another's — an Azure
   * DevOps repository lookup sits at `/repositories/{name}`, and its commits
   * hang off `/repositories/{name}/commits`, so a substring match on the first
   * would answer the second as well.
   */
  onPath(
    suffix: string,
    reply: (request: RecordedRequest) => { status?: number; body?: unknown; headers?: Record<string, string> },
  ): TestProviderServer {
    return this.route((request) => (request.path.endsWith(suffix) ? reply(request) : undefined));
  }

  /** Answers any request whose path contains `fragment`. */
  on(
    fragment: string,
    reply: (request: RecordedRequest) => { status?: number; body?: unknown; headers?: Record<string, string> },
  ): TestProviderServer {
    return this.route((request) => (request.path.includes(fragment) ? reply(request) : undefined));
  }

  /** Every recorded request whose path contains `fragment`. */
  requestsFor(fragment: string): RecordedRequest[] {
    return this.requests.filter((request) => request.path.includes(fragment));
  }

  private handle(incoming: IncomingMessage, response: ServerResponse): void {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const url = new URL(incoming.url ?? "/", this.baseUrl);
      const recorded: RecordedRequest = {
        method: incoming.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        headers: incoming.headers,
        body: Buffer.concat(chunks).toString(),
      };
      this.requests.push(recorded);

      for (const route of this.routes) {
        const result = route(recorded);
        if (!result) continue;
        response.writeHead(result.status ?? 200, {
          "Content-Type": "application/json",
          ...result.headers,
        });
        response.end(JSON.stringify(result.body ?? {}));
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: `no route for ${recorded.path}` }));
    });
  }
}
