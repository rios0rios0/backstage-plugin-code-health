/**
 * Outcomes of talking to a provider that callers act on differently.
 *
 * These live in the domain rather than beside the HTTP client because the
 * ingestion actor branches on them — a host in cooldown means "skip its other
 * repositories this run", a non-retryable status means "record the failure" —
 * and the domain must not have to reach into infrastructure to name the
 * difference.
 */

/** Raised when a host has failed enough times that the gateway stopped calling it. */
export class CircuitOpenError extends Error {
  constructor(
    readonly host: string,
    readonly openUntil: number,
  ) {
    super(`circuit open for ${host}`);
    this.name = "CircuitOpenError";
  }
}

/** Raised for a response the gateway will not retry. */
export class ProviderRequestError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`provider request to ${url} failed with ${status}`);
    this.name = "ProviderRequestError";
  }
}
