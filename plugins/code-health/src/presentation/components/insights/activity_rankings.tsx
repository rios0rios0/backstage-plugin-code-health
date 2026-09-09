import { InfoCard } from "@backstage/core-components";
import { useRouteRef } from "@backstage/core-plugin-api";
import Grid from "@material-ui/core/Grid";
import type {
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo } from "react";
import type { RankedItem } from "../../../domain/entities/insights";
import {
  topContributorsByCommits,
  topRepositoriesByCommits,
  topReviewers,
} from "../../../domain/entities/insights";
import { contributorDetailRouteRef, repositoryDetailRouteRef } from "../../../routes";
import { CONTRIBUTOR_KEY_PARAM } from "../../pages/contributor_detail_page";
import { RankingChart } from "../charts/ranking_chart";

export interface ActivityRankingsProps {
  readonly repositories: readonly RepositorySummary[];
  readonly contributors: readonly ContributorSummary[];
  /**
   * Why the repository ranking has nothing in it, when its own fetch failed.
   *
   * The repositories are a second request the Contributors tab makes purely to
   * fill this one card, so a failure there must not take the contributors down
   * with it. Saying "no commits were recorded" over a failed request would
   * report a quiet window that nobody actually measured, so the card carries
   * the reason instead.
   */
  readonly repositoriesError?: string | null;
}

/**
 * Who committed, who reviewed, and where the work landed.
 *
 * These three sit on the Contributors tab rather than on Insights because they
 * are all questions about *people* — the tab's subject — and because each row
 * is a way into the detail page below it. Insights answers questions about the
 * fleet; a name is not one of them.
 *
 * The rows link to the plugin's own detail pages rather than to the catalog.
 * A catalog entity says who somebody is; the detail page says what they did,
 * which is the question a reader of a ranking already has in hand. An account
 * nobody has linked resolves to no catalog entity at all, so linking to the
 * catalog would leave exactly the rows that need explaining as plain text.
 *
 * Rendered as `Grid item` children so the page composes them into its own grid,
 * the same way the optional integration sections do.
 */
export const ActivityRankings = ({
  repositories,
  contributors,
  repositoriesError = null,
}: ActivityRankingsProps) => {
  const contributorDetailPath = useRouteRef(contributorDetailRouteRef);
  const repositoryDetailPath = useRouteRef(repositoryDetailRouteRef);

  const contributorRanking = useMemo(
    () => topContributorsByCommits(contributors),
    [contributors],
  );
  const reviewerRanking = useMemo(() => topReviewers(contributors), [contributors]);
  const repositoryRanking = useMemo(
    () => topRepositoriesByCommits(repositories),
    [repositories],
  );

  // A person key is `user:default/jane` for a linked person and
  // `vcs:jane@acme.com` for an unlinked account, so it travels in the query
  // string — see `contributorDetailRouteRef`.
  const linkToPerson = (item: RankedItem): string =>
    `${contributorDetailPath()}?${CONTRIBUTOR_KEY_PARAM}=${encodeURIComponent(item.id)}`;
  const linkToRepository = (item: RankedItem): string =>
    repositoryDetailPath({ id: item.id });

  return (
    <>
      <Grid item xs={12} md={4}>
        <InfoCard title="Top contributors" subheader="By commits in the window">
          <RankingChart
            items={contributorRanking}
            unit="commits"
            showAvatars
            linkTo={linkToPerson}
            emptyMessage="No commits were recorded in this window."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={4}>
        <InfoCard
          title="Review load"
          subheader="Who is reviewing — concentration here is a bus factor"
        >
          <RankingChart
            items={reviewerRanking}
            unit="reviews"
            showAvatars
            linkTo={linkToPerson}
            emptyMessage="No reviews were recorded in this window."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={4}>
        <InfoCard title="Most active repositories" subheader="By commits in the window">
          <RankingChart
            items={repositoryRanking}
            unit="commits"
            linkTo={linkToRepository}
            emptyMessage={
              repositoriesError === null
                ? "No commits were recorded in this window."
                : `Repositories could not be loaded: ${repositoriesError}`
            }
          />
        </InfoCard>
      </Grid>
    </>
  );
};
