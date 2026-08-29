import type { LoggerService } from "@backstage/backend-plugin-api";
import { identityKey } from "../entities/identity";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { CatalogReader } from "../services/catalog_reader";

export interface ReconcileIdentitiesResult {
  readonly observed: number;
  readonly linked: number;
}

/**
 * Links every account whose e-mail address matches a catalog user.
 *
 * This is the one rule allowed to link without a human, and only because it is
 * the same rule the catalog itself uses to decide who a `User` entity is: two
 * accounts on the same address are the same person, or the directory is already
 * wrong about something more important than this dashboard.
 *
 * Everything weaker — a matching surname, a username that resembles a name — is
 * offered as a suggestion on the Identities screen and never applied here. A
 * wrong automatic merge is close to invisible: the row simply reads a little
 * high, and nothing anywhere says two people were added together.
 *
 * A manual link is never overwritten. That is enforced in the store rather than
 * here, because this task runs every half hour and quietly undoing somebody's
 * correction is the single failure that would make the screen pointless.
 */
export class ReconcileIdentities {
  constructor(
    private readonly options: {
      readonly store: CodeHealthStore;
      readonly catalog: CatalogReader;
      readonly logger: LoggerService;
    },
  ) {}

  async run(input: { now: Date }): Promise<ReconcileIdentitiesResult> {
    const { store, catalog, logger } = this.options;

    const [identities, links] = await Promise.all([
      store.listIdentities(),
      store.listIdentityLinks(),
    ]);

    const linked = new Set(links.map(identityKey));
    const unlinked = identities.filter(
      (identity) => !linked.has(identityKey(identity)) && identity.email !== null,
    );

    if (unlinked.length === 0) return { observed: identities.length, linked: 0 };

    // Only the addresses that could possibly match are looked up, so the query
    // is bounded by the number of unlinked accounts rather than by the size of
    // the directory — which is routinely thousands of entities.
    const users = await catalog.findUsersByEmail(
      unlinked.flatMap((identity) => (identity.email === null ? [] : [identity.email])),
    );

    let created = 0;
    for (const identity of unlinked) {
      const user = identity.email === null ? undefined : users.get(identity.email.toLowerCase());
      if (user === undefined) continue;

      await store.saveIdentityLink({
        source: identity.source,
        sourceKey: identity.sourceKey,
        entityRef: user.entityRef,
        origin: "catalog-email",
        linkedBy: null,
        linkedAt: input.now,
      });
      created += 1;
    }

    if (created > 0) {
      logger.info(
        `linked ${created} of ${unlinked.length} unlinked accounts to catalog users by e-mail`,
      );
    }

    return { observed: identities.length, linked: created };
  }
}
