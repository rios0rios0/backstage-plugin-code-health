import type { ContributorIdentity } from "@rios0rios0/backstage-plugin-code-health-common";
import {
  identityKey,
  personKeyOf,
  type IdentityLinkRecord,
  type IdentityRecord,
  type IdentityRef,
} from "./identity";

/** What is known about a person, drawn from every account merged into them. */
export interface PersonProfile {
  readonly entityRef: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly profileUrl: string | null;
  readonly identities: readonly ContributorIdentity[];
}

const toContributorIdentity = (record: IdentityRef & { displayName?: string | null }) => ({
  source: record.source,
  sourceKey: record.sourceKey,
  displayName: record.displayName ?? null,
});

/**
 * Answers "whose row does this account belong on?".
 *
 * Built once per request from the link table, then consulted for every event
 * and every stored measure. Doing the resolution on read rather than baking it
 * into the stored rows is what makes re-linking somebody retroactive: correct a
 * link today and every window the plugin ever collected reports the corrected
 * total, instead of only the windows collected afterwards.
 */
export class PersonDirectory {
  private readonly linksByIdentity: Map<string, IdentityLinkRecord>;
  private readonly membersByPerson = new Map<string, IdentityRecord[]>();

  constructor(options: {
    readonly links: readonly IdentityLinkRecord[];
    readonly identities: readonly IdentityRecord[];
  }) {
    this.linksByIdentity = new Map(options.links.map((link) => [identityKey(link), link]));

    for (const identity of options.identities) {
      const key = this.keyOf(identity);
      const bucket = this.membersByPerson.get(key);
      if (bucket) bucket.push(identity);
      else this.membersByPerson.set(key, [identity]);
    }
  }

  keyOf(identity: IdentityRef): string {
    return personKeyOf(identity, this.linksByIdentity.get(identityKey(identity)));
  }

  /**
   * The person's catalog user, or null when no account on the row is linked.
   *
   * Read back off the key rather than stored separately: an unlinked person's
   * key is `<source>:<sourceKey>`, which contains a colon but is not an entity
   * reference, so the two are told apart by whether any link produced the key
   * rather than by trying to parse it.
   */
  entityRefOf(personKey: string): string | null {
    return personKey.startsWith("user:") ? personKey : null;
  }

  /**
   * What is known about a person, merged across their accounts.
   *
   * The fallback is the account that reported it most recently rather than the
   * first one found: a name changes, and the newest one is the one the person
   * would recognise. `fallback` supplies what an account that has not been
   * observed yet would otherwise have no profile for — an event carries the
   * name the provider stamped on the commit, and it is better than the key.
   */
  profileOf(
    personKey: string,
    fallback: { displayName: string | null; avatarUrl: string | null; profileUrl: string | null },
  ): PersonProfile {
    const members = [...(this.membersByPerson.get(personKey) ?? [])].sort(
      (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
    );

    const firstWith = <T>(pick: (record: IdentityRecord) => T | null): T | null => {
      for (const member of members) {
        const value = pick(member);
        if (value !== null && value !== "") return value;
      }
      return null;
    };

    return {
      entityRef: this.entityRefOf(personKey),
      displayName: firstWith((member) => member.displayName) ?? fallback.displayName,
      avatarUrl: firstWith((member) => member.avatarUrl) ?? fallback.avatarUrl,
      profileUrl: firstWith((member) => member.profileUrl) ?? fallback.profileUrl,
      identities: members.map(toContributorIdentity),
    };
  }
}
