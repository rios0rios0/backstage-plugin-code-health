import type { CodeHealthStore } from "../../domain/repositories/code_health_store";
import type {
  IdentityObserver,
  ObservedIdentity,
} from "../../domain/services/identity_resolver";

/**
 * Records observed accounts in the plugin's own database.
 *
 * A separate port from the store rather than handing collectors the whole store
 * interface: a collector that could also move an ingestion cursor is a collector
 * that can corrupt the history, and the narrower type is what makes that
 * impossible rather than merely discouraged.
 */
export class StoreIdentityObserver implements IdentityObserver {
  constructor(private readonly store: CodeHealthStore) {}

  async observe(identities: readonly ObservedIdentity[], now: Date): Promise<void> {
    if (identities.length === 0) return;
    await this.store.recordObservedIdentities({ identities, now });
  }
}
