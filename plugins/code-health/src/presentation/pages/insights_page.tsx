import { ContentHeader, InfoCard, Progress, WarningPanel } from "@backstage/core-components";
import type { TimeSeriesBucket } from "@rios0rios0/backstage-plugin-code-health-common";
import Box from "@material-ui/core/Box";
import Divider from "@material-ui/core/Divider";
import Grid from "@material-ui/core/Grid";
import { useMemo } from "react";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import {
  complianceBreakdown,
  computeKpis,
  qualityGateBreakdown,
  toCadence,
  topContributorsByCommits,
  topRepositoriesByCommits,
  topReviewers,
} from "../../domain/entities/insights";
import type {
  ContributorService,
  DashboardService,
  TimeSeriesService,
} from "../../domain/services/dashboard_service";
import { BackfillProgress } from "../components/backfill_progress";
import { CadenceChart } from "../components/charts/cadence_chart";
import { RankingChart } from "../components/charts/ranking_chart";
import { StatTile } from "../components/charts/stat_tile";
import { StatusBreakdown } from "../components/charts/status_breakdown";
import { DashboardToolbar } from "../components/dashboard_toolbar";
import { useAutoRefresh } from "../hooks/use_auto_refresh";
import type { UseCoverageResult } from "../hooks/use_coverage";
import { useInsights } from "../hooks/use_insights";
import { useTimeRange } from "../hooks/use_time_range";

interface InsightsPageProps {
  dashboardService: DashboardService;
  contributorService: ContributorService;
  timeSeriesService: TimeSeriesService;
  coverage: UseCoverageResult;
  config: CodeHealthConfig;
  enabled?: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Buckets chosen from the window's length rather than exposed as a control.
 *
 * A daily bucket over a year is 365 points across roughly 700 pixels, which is
 * noise; a monthly bucket over a week is one point. Deriving it removes a knob
 * whose only correct setting is implied by the range already picked.
 */
const bucketFor = (from: string, to: string): TimeSeriesBucket => {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / DAY;
  if (days > 180) return "month";
  if (days > 45) return "week";
  return "day";
};

const formatCount = (value: number): string => value.toLocaleString();
const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${value}%`;

export const InsightsPage = ({
  dashboardService,
  contributorService,
  timeSeriesService,
  coverage,
  config,
  enabled = true,
}: InsightsPageProps) => {
  const range = useTimeRange(coverage.coverage, config.defaultRange);
  const bucket = bucketFor(range.window.from, range.window.to);

  const { repositories, contributors, cadence, isLoading, error, lastFetchedAt, refetch } =
    useInsights(
      dashboardService,
      contributorService,
      timeSeriesService,
      range.window,
      bucket,
      enabled,
    );
  const { interval, setInterval } = useAutoRefresh(refetch, config.refreshIntervalMs);

  const kpis = useMemo(
    () => computeKpis(repositories, contributors),
    [repositories, contributors],
  );
  const contributorRanking = useMemo(
    () => topContributorsByCommits(contributors),
    [contributors],
  );
  const reviewerRanking = useMemo(() => topReviewers(contributors), [contributors]);
  const repositoryRanking = useMemo(
    () => topRepositoriesByCommits(repositories),
    [repositories],
  );
  const qualityGates = useMemo(() => qualityGateBreakdown(repositories), [repositories]);
  const compliance = useMemo(() => complianceBreakdown(repositories), [repositories]);
  const cadencePoints = useMemo(() => toCadence(cadence), [cadence]);

  const showEmpty = !isLoading && repositories.length === 0 && error === null;

  return (
    <>
      <ContentHeader title="Insights">
        <DashboardToolbar
          lastFetchedAt={lastFetchedAt}
          refreshInterval={interval}
          isLoading={isLoading}
          ranges={range.ranges}
          selectedRange={range.selected}
          onRangeChange={range.select}
          onRefresh={refetch}
          onIntervalChange={setInterval}
        />
      </ContentHeader>

      {coverage.coverage && <BackfillProgress coverage={coverage.coverage} />}

      {error && (
        <Box mb={2}>
          <WarningPanel
            severity="error"
            title="Failed to load insights"
            message={error}
            defaultExpanded
          />
        </Box>
      )}

      {isLoading && repositories.length === 0 ? <Progress /> : null}

      {showEmpty ? (
        <WarningPanel
          severity="info"
          title="Nothing to chart yet"
          message="No repositories were tracked in this window. Insights fill in once the backend has discovered catalog entities and ingested their history."
        />
      ) : null}

      {repositories.length > 0 ? (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <InfoCard title="At a glance">
              <Grid container spacing={3}>
                <Grid item xs={6} sm={4} md={2}>
                  <StatTile
                    label="Active repos"
                    value={formatCount(kpis.activeRepositories)}
                    caption={`of ${formatCount(kpis.trackedRepositories)} tracked`}
                    help="Repositories with at least one commit inside the selected window."
                  />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <StatTile
                    label="Contributors"
                    value={formatCount(kpis.activeContributors)}
                    caption="committed in window"
                    help="Distinct commit-author identities. The same person committing under two addresses counts twice."
                  />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <StatTile label="Commits" value={formatCount(kpis.commits)} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <StatTile
                    label="PRs merged"
                    value={formatCount(kpis.pullRequestsMerged)}
                  />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <StatTile
                    label="Build success"
                    value={formatPercent(kpis.buildSuccessRate)}
                    caption="of pipeline runs"
                    help="Succeeded runs as a share of all pipeline runs in the window."
                  />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <StatTile
                    label="Review coverage"
                    value={formatPercent(kpis.reviewCoverage)}
                    caption="reviews per merged PR"
                    help="Reviews recorded against merged pull requests, capped at 100%. A low figure means work is merging unreviewed."
                  />
                </Grid>
              </Grid>
            </InfoCard>
          </Grid>

          <Grid item xs={12}>
            <InfoCard
              title="Delivery cadence"
              subheader={`Bucketed by ${bucket}. Both series share one scale.`}
            >
              <CadenceChart points={cadencePoints} />
            </InfoCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <InfoCard title="Top contributors" subheader="By commits in the window">
              <RankingChart
                items={contributorRanking}
                unit="commits"
                showAvatars
                emptyMessage="No commits were recorded in this window."
              />
            </InfoCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <InfoCard title="Most active repositories" subheader="By commits in the window">
              <RankingChart
                items={repositoryRanking}
                unit="commits"
                emptyMessage="No commits were recorded in this window."
              />
            </InfoCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <InfoCard
              title="Review load"
              subheader="Who is reviewing — concentration here is a bus factor"
            >
              <RankingChart
                items={reviewerRanking}
                unit="reviews"
                showAvatars
                emptyMessage="No reviews were recorded in this window."
              />
            </InfoCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <InfoCard title="Fleet health">
              <Box mb={1} fontWeight={500}>
                Quality gates
              </Box>
              <StatusBreakdown slices={qualityGates} />
              <Box my={2}>
                <Divider />
              </Box>
              <Box mb={1} fontWeight={500}>
                Branch and build policy
              </Box>
              <StatusBreakdown slices={compliance} />
            </InfoCard>
          </Grid>
        </Grid>
      ) : null}
    </>
  );
};
