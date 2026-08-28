import type { DirectoryUser } from "@rios0rios0/backstage-plugin-code-health-common";
import { parseEntityRef } from "@rios0rios0/backstage-plugin-code-health-common";
import type { DirectoryReader } from "../../src/domain/services/identity_resolver";

/**
 * Canonical form of a reference, for matching.
 *
 * The catalog is far more permissive than the string it hands back: it resolves
 * `user:jdoe` with the namespace omitted and `user:default/JDoe` with the name
 * miscased, and answers both with the entity's own canonical reference. A
 * double that only matched the exact string would let a caller that stores the
 * *typed* reference pass every test and fail on the first real catalog.
 */
const canonical = (entityRef: string): string | null => {
  const parsed = parseEntityRef(entityRef);
  return parsed === null
    ? null
    : `${parsed.kind}:${parsed.namespace}/${parsed.name.toLowerCase()}`;
};

/** Canned answers for the catalog's people, with no catalog behind them. */
export class StubDirectoryReader implements DirectoryReader {
  listUserCalls = 0;
  /** References each by-ref fetch asked for, so a test can bound the query. */
  readonly refLookups: Array<readonly string[]> = [];

  constructor(private readonly users: readonly DirectoryUser[] = []) {}

  async listUsers(): Promise<DirectoryUser[]> {
    this.listUserCalls += 1;
    return [...this.users];
  }

  async getUsersByRef(entityRefs: readonly string[]): Promise<Map<string, DirectoryUser>> {
    this.refLookups.push(entityRefs);

    const found = new Map<string, DirectoryUser>();
    for (const requested of entityRefs) {
      const wanted = canonical(requested);
      if (wanted === null) continue;
      const user = this.users.find((candidate) => canonical(candidate.entityRef) === wanted);
      // Keyed by what was asked for, valued by what the entity actually is —
      // which is what the real adapter does, and the whole reason a caller must
      // store `user.entityRef` rather than the string it passed in.
      if (user !== undefined) found.set(requested, user);
    }
    return found;
  }
}
