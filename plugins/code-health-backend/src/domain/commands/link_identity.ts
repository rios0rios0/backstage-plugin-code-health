import type { IdentitySource } from "@rios0rios0/backstage-plugin-code-health-common";
import { normalizeSourceKey } from "../entities/identity";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { DirectoryReader } from "../services/identity_resolver";

export class UnknownIdentityError extends Error {
  constructor(source: IdentitySource, sourceKey: string) {
    super(`no ${source} identity called ${sourceKey} has been observed`);
    this.name = "UnknownIdentityError";
  }
}

export class UnknownUserError extends Error {
  constructor(entityRef: string) {
    super(`${entityRef} is not a user in the catalog`);
    this.name = "UnknownUserError";
  }
}

/**
 * Attaches an account to a catalog user, or detaches it again.
 *
 * Both halves are verified before anything is written. An account nobody has
 * observed and a user the catalog does not hold both produce a link that
 * silently matches nothing — the contributor row would look exactly as it did
 * before, and the person who made the link would have no way to tell it had not
 * worked. Failing loudly at the moment of the mistake is the only point at
 * which it is cheap to fix.
 */
export class LinkIdentity {
  constructor(
    private readonly store: CodeHealthStore,
    private readonly directory: DirectoryReader,
  ) {}

  async link(input: {
    source: IdentitySource;
    sourceKey: string;
    entityRef: string;
    linkedBy: string | null;
    now: Date;
  }): Promise<void> {
    const sourceKey = normalizeSourceKey(input.sourceKey);

    const observed = await this.store.listIdentities({ sources: [input.source] });
    if (!observed.some((identity) => identity.sourceKey === sourceKey)) {
      throw new UnknownIdentityError(input.source, sourceKey);
    }

    const users = await this.directory.getUsersByRef([input.entityRef]);
    if (!users.has(input.entityRef)) {
      throw new UnknownUserError(input.entityRef);
    }

    await this.store.saveIdentityLink({
      source: input.source,
      sourceKey,
      entityRef: input.entityRef,
      origin: "manual",
      linkedBy: input.linkedBy,
      linkedAt: input.now,
    });
  }

  async unlink(input: { source: IdentitySource; sourceKey: string }): Promise<void> {
    await this.store.deleteIdentityLink({
      source: input.source,
      sourceKey: normalizeSourceKey(input.sourceKey),
    });
  }
}
