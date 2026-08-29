import type {
  IdentityObserver,
  ObservedIdentity,
} from "../../src/domain/services/identity_resolver";

/**
 * Records what a collector reported.
 *
 * A recording double rather than an in-memory one because there is nothing to
 * read back: observing an account is fire-and-forget from the collector's point
 * of view, and the only observable behaviour is that the call was made with the
 * right accounts.
 */
export class RecordingIdentityObserver implements IdentityObserver {
  readonly observed: ObservedIdentity[] = [];
  calls = 0;

  async observe(identities: readonly ObservedIdentity[], _now: Date): Promise<void> {
    this.calls += 1;
    this.observed.push(...identities);
  }

  keys(): string[] {
    return this.observed.map((identity) => `${identity.source}:${identity.sourceKey}`);
  }
}
