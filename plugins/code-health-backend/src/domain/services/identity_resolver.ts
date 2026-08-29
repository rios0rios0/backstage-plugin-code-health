import type {
  DirectoryUser,
  IdentitySource,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * An account a source just told the plugin about.
 *
 * Deliberately the wire shape minus its timestamps: the store owns those, so a
 * collector cannot accidentally report an account as first seen today every
 * time it runs.
 */
export interface ObservedIdentity {
  readonly source: IdentitySource;
  /** Normalised with `normalizeSourceKey`. Stable for the life of the account. */
  readonly sourceKey: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly profileUrl: string | null;
}

/**
 * Records the accounts a source saw.
 *
 * Handed to every collector and enricher, which is the whole reason the
 * Identities screen can offer a WakaTime username or an Atlassian account id as
 * something to link before anybody has looked at a dashboard.
 */
export interface IdentityObserver {
  observe(identities: readonly ObservedIdentity[], now: Date): Promise<void>;
}

/**
 * Reads the organisation's people out of the catalog.
 *
 * Separate from {@link CatalogReader}'s e-mail lookup on purpose: this one
 * enumerates the directory, which is thousands of entities in a real
 * organisation. It is only ever called from the Identities screen, where a
 * person is deliberately asking for the list, and never from a dashboard load.
 */
export interface DirectoryReader {
  listUsers(): Promise<DirectoryUser[]>;
  getUsersByRef(entityRefs: readonly string[]): Promise<Map<string, DirectoryUser>>;
}
