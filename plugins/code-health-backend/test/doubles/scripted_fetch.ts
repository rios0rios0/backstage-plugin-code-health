import type {
  FetchLike,
  HttpResponseLike,
} from "../../src/infrastructure/http/provider_gateway";

export interface ScriptedReply {
  readonly status: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

const response = (reply: ScriptedReply): HttpResponseLike => {
  const headers = new Map(
    Object.entries(reply.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    status: reply.status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => reply.body ?? "",
  };
};

/**
 * A hand-rolled transport that replays a scripted sequence of replies and
 * records what it was asked for.
 *
 * Real HTTP behaviour — header casing, chunked bodies, connection handling — is
 * covered separately against a real `http.createServer`. This exists for the
 * cases a real server cannot express conveniently, such as "fail four times in
 * a row, then succeed".
 */
export class ScriptedFetch {
  private replies: ScriptedReply[] = [];
  private failures: Error[] = [];

  readonly calls: RecordedCall[] = [];

  withReplies(...replies: ScriptedReply[]): ScriptedFetch {
    this.replies = [...this.replies, ...replies];
    return this;
  }

  /** Queues a transport-level failure, as a network error rather than a status. */
  withNetworkFailure(message = "socket hang up"): ScriptedFetch {
    this.failures = [...this.failures, new Error(message)];
    this.replies = [...this.replies, { status: -1 }];
    return this;
  }

  get fetch(): FetchLike {
    return async (url, init) => {
      this.calls.push({
        url,
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
      });

      const reply = this.replies[this.calls.length - 1];
      if (!reply) throw new Error(`no scripted reply for call ${this.calls.length} to ${url}`);
      if (reply.status === -1) {
        const failure = this.failures.shift();
        throw failure ?? new Error("scripted network failure");
      }

      return response(reply);
    };
  }
}
