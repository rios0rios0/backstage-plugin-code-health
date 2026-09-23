import type { ContributorRole } from "@rios0rios0/backstage-plugin-code-health-common";
import { parseEntityRef } from "@rios0rios0/backstage-plugin-code-health-common";
import { accountOfPersonKey } from "../entities/contributor_role";
import { identityKey, normalizeSourceKey } from "../entities/identity";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { DirectoryReader } from "../services/identity_resolver";
import { NotAUserReferenceError, UnknownIdentityError, UnknownUserError } from "./link_identity";

export class MalformedPersonKeyError extends Error {
  constructor(key: string) {
    super(
      `\`${key}\` is not a person key; expected \`user:<namespace>/<name>\` or \`<source>:<account>\``,
    );
    this.name = "MalformedPersonKeyError";
  }
}

/**
 * Records what a person is scored as.
 *
 * The key is the one their contributor row carries: a catalog reference for
 * somebody linked, `<source>:<sourceKey>` for an account nobody has linked. The
 * role is stored under that key and resolved through the person directory on
 * read, so a role given to an account before it was linked follows it onto the
 * linked row, and a role given to a person reaches every account of theirs.
 *
 * The subject is verified before anything is written, for the same reason a
 * link is: a role on a key nothing carries changes no row, and the
 * administrator who assigned it would have no way to tell it did not take. A
 * catalog user is verified against the catalog and an account against what
 * has been observed, and the stored key is the catalog's own spelling of the
 * reference rather than the one that was sent — `user:default/JDoe` resolves,
 * but the row is keyed by what the catalog calls the entity.
 *
 * There is no "clear" half to this command. Everybody is an engineer until
 * somebody says otherwise, so making somebody an engineer again is the same
 * statement as never having said anything, and it is made the same way.
 */
export class AssignContributorRole {
  constructor(
    private readonly store: CodeHealthStore,
    private readonly directory: DirectoryReader,
  ) {}

  async assign(input: {
    key: string;
    role: ContributorRole;
    assignedBy: string | null;
    now: Date;
  }): Promise<void> {
    const personKey = await this.subjectOf(input.key);

    await this.store.saveContributorRole({
      personKey,
      role: input.role,
      assignedBy: input.assignedBy,
      assignedAt: input.now,
    });
  }

  /** The key to store the role under, once the thing it names is known to exist. */
  private async subjectOf(key: string): Promise<string> {
    const account = accountOfPersonKey(key);
    if (account !== null) {
      // Normalised the way every account key is, so a differently cased key
      // names the same account rather than a row nobody carries.
      const sourceKey = normalizeSourceKey(account.sourceKey);
      const observed = await this.store.listIdentities({ sources: [account.source] });
      if (!observed.some((identity) => identity.sourceKey === sourceKey)) {
        throw new UnknownIdentityError(account.source, sourceKey);
      }
      return identityKey({ source: account.source, sourceKey });
    }

    const parsed = parseEntityRef(key);
    if (parsed === null) throw new MalformedPersonKeyError(key);
    // A group parses, and a role on a group would be a row nobody carries:
    // person keys are users, and the directory answers for users alone.
    if (parsed.kind !== "user") throw new NotAUserReferenceError(key, parsed.kind);

    const users = await this.directory.getUsersByRef([key]);
    const user = users.get(key);
    if (user === undefined) throw new UnknownUserError(key);
    return user.entityRef;
  }
}
