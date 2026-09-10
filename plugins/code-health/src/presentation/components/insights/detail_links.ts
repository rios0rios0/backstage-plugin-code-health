import { useRouteRef } from "@backstage/core-plugin-api";
import type { RankedItem } from "../../../domain/entities/insights";
import { contributorDetailRouteRef, repositoryDetailRouteRef } from "../../../routes";
import { CONTRIBUTOR_KEY_PARAM } from "../../pages/contributor_detail_page";

/**
 * Where a ranked row goes when it names somebody or something this plugin has
 * a page for.
 *
 * Every ranking on the Contributors and Repositories tabs points at the
 * plugin's own detail pages rather than at the catalog. A catalog entity says
 * who somebody is; the detail page says what they did, which is the question a
 * reader of a ranking already has in hand. An account nobody has linked
 * resolves to no catalog entity at all, so linking to the catalog would leave
 * exactly the rows that need explaining as plain text.
 *
 * Both are hooks because a route ref only resolves to a path through
 * `useRouteRef`, and they live beside the cards that use them for the same
 * reason `useChartPalette` does: nothing outside this folder asks the question.
 */

/**
 * A person's row, addressed by the key the ranking helpers put in `id`.
 *
 * The key travels in the query string: it is `user:default/jane` for a linked
 * person and `vcs:jane@acme.com` for an unlinked account, and both carry
 * characters a path segment has to encode — see `contributorDetailRouteRef`.
 */
export const usePersonLink = (): ((item: RankedItem) => string) => {
  const contributorDetailPath = useRouteRef(contributorDetailRouteRef);

  return (item) =>
    `${contributorDetailPath()}?${CONTRIBUTOR_KEY_PARAM}=${encodeURIComponent(item.id)}`;
};

/** A repository's row, addressed by the repository id in `id`. */
export const useRepositoryLink = (): ((item: RankedItem) => string) => {
  const repositoryDetailPath = useRouteRef(repositoryDetailRouteRef);

  return (item) => repositoryDetailPath({ id: item.id });
};
