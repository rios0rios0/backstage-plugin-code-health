import type {
  IdentityRow,
  IdentitySource,
  IdentitySuggestion,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { suggestIdentityMatches } from "@rios0rios0/backstage-plugin-code-health-common";
import { identityKey, type IdentityRecord } from "../entities/identity";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { DirectoryReader } from "../services/identity_resolver";

const toWire = (record: IdentityRecord) => ({
  source: record.source,
  sourceKey: record.sourceKey,
  displayName: record.displayName,
  email: record.email,
  avatarUrl: record.avatarUrl,
  profileUrl: record.profileUrl,
  firstSeenAt: record.firstSeenAt.toISOString(),
  lastSeenAt: record.lastSeenAt.toISOString(),
});

/**
 * Everything the Identities screen renders: the accounts the plugin has seen,
 * who each one is linked to, and who it might be.
 *
 * The directory is enumerated once for the whole listing rather than per row.
 * That is the only expensive part, and doing it per account would turn a screen
 * with two hundred unlinked rows into two hundred catalog queries.
 *
 * Suggestions are computed only for accounts nobody has linked. An account with
 * a link already has its answer, and offering alternatives beside it invites
 * somebody to change a correct row for a plausible-looking wrong one.
 */
export class ListIdentities {
  constructor(
    private readonly store: CodeHealthStore,
    private readonly directory: DirectoryReader,
  ) {}

  async run(input: {
    sources?: readonly IdentitySource[];
    linked?: boolean;
  }): Promise<IdentityRow[]> {
    const [identities, links] = await Promise.all([
      this.store.listIdentities(
        input.sources === undefined ? {} : { sources: input.sources },
      ),
      this.store.listIdentityLinks(),
    ]);

    const linksByIdentity = new Map(links.map((link) => [identityKey(link), link]));

    const visible = identities.filter((identity) => {
      if (input.linked === undefined) return true;
      return linksByIdentity.has(identityKey(identity)) === input.linked;
    });

    const needsSuggestions = visible.some(
      (identity) => !linksByIdentity.has(identityKey(identity)),
    );
    const users = needsSuggestions ? await this.directory.listUsers() : [];

    return visible.map((identity) => {
      const link = linksByIdentity.get(identityKey(identity));
      const suggestions: readonly IdentitySuggestion[] =
        link === undefined ? suggestIdentityMatches(identity, users) : [];

      return {
        identity: toWire(identity),
        link:
          link === undefined
            ? null
            : {
                entityRef: link.entityRef,
                origin: link.origin,
                linkedBy: link.linkedBy,
                linkedAt: link.linkedAt.toISOString(),
              },
        suggestions,
      };
    });
  }
}
