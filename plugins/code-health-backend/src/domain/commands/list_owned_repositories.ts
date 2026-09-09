import type {
  OwnershipInfo,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { CatalogReader } from "../services/catalog_reader";
import type { ListRepositorySummaries } from "./list_repository_summaries";

export interface OwnedRepositories {
  readonly ownership: OwnershipInfo;
  readonly items: readonly RepositorySummary[];
}

/**
 * The person key that is a catalog user, or null when nobody has linked the row.
 *
 * The same rule `PersonDirectory.entityRefOf` applies, and for the same reason:
 * an unlinked person's key is `<source>:<sourceKey>`, which contains a colon but
 * is not an entity reference, so the two are told apart by the `user:` prefix
 * rather than by trying to parse either.
 */
const userRefOf = (key: string): string | null =>
  key.startsWith("user:") ? key : null;

export class ListOwnedRepositories {
  constructor(
    private readonly repositories: ListRepositorySummaries,
    private readonly catalog: CatalogReader,
  ) {}

  /**
   * The repositories a contributor row is responsible for in a window.
   *
   * Responsibility is the catalog's `spec.owner`, matched against the person's
   * own `User` entity and every group they belong to — a different question
   * from where they committed, and the one a team lead asking "are they looking
   * after their projects" actually means.
   *
   * A row nobody has linked to a catalog user owns nothing, and says so with an
   * empty `owners` rather than an empty list of repositories: "this person owns
   * no repositories" and "this account is not attached to anybody yet" want
   * completely different words on the screen, and the Identities tab is the
   * answer to only one of them.
   */
  async run(input: {
    key: string;
    from: Date;
    to: Date;
  }): Promise<OwnedRepositories> {
    const entityRef = userRefOf(input.key);
    if (entityRef === null) return { ownership: { entityRef: null, owners: [] }, items: [] };

    const owners = await this.catalog.listOwnershipRefs(entityRef);
    if (owners.length === 0) return { ownership: { entityRef, owners }, items: [] };

    // Case-folded because a reference is compared, not displayed: the catalog
    // lower-cases the kind and namespace but keeps the name as it was typed, so
    // one group spelled `group:default/Platform` on the entity and
    // `group:default/platform` in a relation is the same group.
    const wanted = new Set(owners.map((owner) => owner.toLowerCase()));

    const items = (await this.repositories.run({ from: input.from, to: input.to }))
      .filter(
        (summary) => summary.ownerRef !== null && wanted.has(summary.ownerRef.toLowerCase()),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    return { ownership: { entityRef, owners }, items };
  }
}
