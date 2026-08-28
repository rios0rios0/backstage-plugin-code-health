import type { DirectoryUser } from "@rios0rios0/backstage-plugin-code-health-common";
import type { DirectoryReader } from "../../src/domain/services/identity_resolver";

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
    const wanted = new Set(entityRefs);
    return new Map(
      this.users
        .filter((user) => wanted.has(user.entityRef))
        .map((user) => [user.entityRef, user]),
    );
  }
}
