import { InfoCard } from "@backstage/core-components";
import Grid from "@material-ui/core/Grid";
import type {
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo } from "react";
import {
  topContributorsByCommits,
  topRepositoriesByCommits,
  topReviewers,
} from "../../../domain/entities/insights";
import { RankingChart } from "../charts/ranking_chart";
import { usePersonLink, useRepositoryLink } from "./detail_links";

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
 * The rows link to the plugin's own detail pages rather than to the catalog —
 * see `detail_links`, which every ranking on both tabs shares.
 *
 * Rendered as `Grid item` children so the page composes them into its own grid,
 * the same way the optional integration sections do.
 */
export const ActivityRankings = ({
  repositories,
  contributors,
  repositoriesError = null,
}: ActivityRankingsProps) => {
  const linkToPerson = usePersonLink();
  const linkToRepository = useRepositoryLink();

  const contributorRanking = useMemo(
    () => topContributorsByCommits(contributors),
    [contributors],
  );
  const reviewerRanking = useMemo(() => topReviewers(contributors), [contributors]);
  const repositoryRanking = useMemo(
    () => topRepositoriesByCommits(repositories),
    [repositories],
  );

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
