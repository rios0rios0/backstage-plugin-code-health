import type { ConfigApi, DiscoveryApi, FetchApi } from "@backstage/core-plugin-api";

export interface RecordedFetch {
  readonly url: string;
  readonly method: string;
}

export interface ScriptedResponse {
  readonly status?: number;
  readonly body?: unknown;
}

/**
 * Hand-rolled {@link FetchApi}.
 *
 * `FetchApi` is a port the plugin depends on, not a transport it owns, so a
 * double here replaces a collaborator rather than mocking HTTP. It records what
 * was asked for so a test can assert the window a request carried.
 */
export class StubFetchApi {
  private responses: ScriptedResponse[] = [];
  private failure: Error | null = null;

  readonly calls: RecordedFetch[] = [];

  withResponses(...responses: ScriptedResponse[]): StubFetchApi {
    this.responses = [...this.responses, ...responses];
    return this;
  }

  withNetworkFailure(message = "Failed to fetch"): StubFetchApi {
    this.failure = new Error(message);
    return this;
  }

  get fetchApi(): FetchApi {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        this.calls.push({
          url: String(input),
          method: init?.method ?? "GET",
        });

        if (this.failure) throw this.failure;

        const scripted = this.responses[this.calls.length - 1] ?? { status: 200, body: {} };
        const status = scripted.status ?? 200;

        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => {
            if (scripted.body === undefined) throw new Error("not json");
            return scripted.body;
          },
        } as Response;
      },
    };
  }

  /** The query parameters of the call at `index`. */
  queryOf(index: number): URLSearchParams {
    return new URL(this.calls[index].url).searchParams;
  }
}

export class StubDiscoveryApi implements DiscoveryApi {
  readonly calls: string[] = [];

  constructor(private readonly baseUrl = "http://localhost:7007/api/code-health") {}

  async getBaseUrl(pluginId: string): Promise<string> {
    this.calls.push(pluginId);
    return this.baseUrl;
  }
}

/**
 * In-memory {@link ConfigApi} covering only what the plugin reads. Keys are
 * dot-separated paths, e.g. `codeHealth.refreshIntervalMs`.
 */
export class StubConfigApi {
  constructor(private readonly values: Record<string, string | number> = {}) {}

  has(key: string): boolean {
    return Object.keys(this.values).some(
      (candidate) => candidate === key || candidate.startsWith(`${key}.`),
    );
  }

  getOptionalString(key: string): string | undefined {
    const value = this.values[key];
    return typeof value === "string" ? value : undefined;
  }

  getOptionalNumber(key: string): number | undefined {
    const value = this.values[key];
    return typeof value === "number" ? value : undefined;
  }

  /** Returns a view scoped under `prefix`, or undefined when nothing matches. */
  getOptionalConfig(prefix: string): StubConfigApi | undefined {
    if (!this.has(prefix)) return undefined;

    const scoped = Object.fromEntries(
      Object.entries(this.values)
        .filter(([key]) => key.startsWith(`${prefix}.`))
        .map(([key, value]) => [key.slice(prefix.length + 1), value]),
    );

    return new StubConfigApi(scoped);
  }
}

export const asConfigApi = (stub: StubConfigApi): ConfigApi => stub as unknown as ConfigApi;
