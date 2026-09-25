import { ContentHeader, WarningPanel } from "@backstage/core-components";
import Box from "@material-ui/core/Box";
import Grid from "@material-ui/core/Grid";
import type {
  ContributorRole,
  ContributorSummary,
  IntegrationCapabilities,
  ProductivityWeightsByRole,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { DEFAULT_PRODUCTIVITY_WEIGHTS } from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useState } from "react";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import type {
  ContributorService,
  DashboardService,
  ScoringService,
} from "../../domain/services/dashboard_service";
import { BackfillProgress } from "../components/backfill_progress";
import { ContributorsTable } from "../components/contributors_table";
import { DashboardToolbar } from "../components/dashboard_toolbar";
import { ActivityRankings } from "../components/insights/activity_rankings";
import { ConfluenceContributorInsights } from "../components/insights/confluence_insights";
import { JiraContributorInsights } from "../components/insights/jira_insights";
import { WakaTimeContributorInsights } from "../components/insights/wakatime_insights";
import { ClaudeContributorInsights } from "../components/insights/claude_insights";
import { useAutoRefresh } from "../hooks/use_auto_refresh";
import { useContributors } from "../hooks/use_contributors";
import type { UseCoverageResult } from "../hooks/use_coverage";
import { useRepositories } from "../hooks/use_repositories";
import { useTimeRange } from "../hooks/use_time_range";

interface ContributorsPageProps {
  contributorService: ContributorService;
  /** For the repository ranking shown above the table. */
  dashboardService: DashboardService;
  /** For the one write this tab makes: what a person is scored as. */
  scoringService: ScoringService;
  coverage: UseCoverageResult;
  config: CodeHealthConfig;
  capabilities: IntegrationCapabilities;
  /** The weights each role is scored on, as the backend answered. */
  weights?: ProductivityWeightsByRole;
  /** Whether the reader may change a person's role, as the backend answered. */
  canAssignRoles?: boolean;
  /** Skips fetching, used while the coverage probe is still in flight. */
  enabled?: boolean;
}

const messageOf = (caught: unknown): string =>
  caught instanceof Error ? caught.message : String(caught);

/**
 * Who worked, and on what.
 *
 * The rankings above the table are the tab's summary of itself: the table is
 * ordered on one column at a time, so "who committed most" and "who reviewed
 * most" are two different sorts of it that nobody can see at once. Each row is
 * also the way into a person's or a repository's detail page.
 *
 * Every configured integration adds its own ranking of people to the same grid,
 * because coding time, tickets closed and pages written are all answers to the
 * tab's question and none of them is an answer to the fleet's. They are gated
 * on the capability rather than on the data: inferring it from whether a row
 * carries a value cannot tell a switched-off integration from one that is on
 * and has not collected yet.
 */
export const ContributorsPage = ({
  contributorService,
  dashboardService,
  scoringService,
  coverage,
  config,
  capabilities,
  weights = DEFAULT_PRODUCTIVITY_WEIGHTS,
  canAssignRoles = false,
  enabled = true,
}: ContributorsPageProps) => {
  const range = useTimeRange(coverage.coverage, config.defaultRange);
  const { contributors, isLoading, error, lastFetchedAt, refetch } = useContributors(
    contributorService,
    range.window,
    enabled,
  );
  const [roleError, setRoleError] = useState<string | null>(null);
  const [isAssigningRole, setIsAssigningRole] = useState(false);

  // The rows are re-read rather than patched: the role decides which weights
  // the score is folded through, and the backend is what resolves a role to
  // every account of the person — re-reading is how the table shows exactly
  // what the backend now says rather than a second implementation of it.
  const assignRole = useCallback(
    async (contributor: ContributorSummary, role: ContributorRole) => {
      setRoleError(null);
      setIsAssigningRole(true);
      try {
        await scoringService.assignContributorRole(contributor.key, role);
        await refetch();
      } catch (caught) {
        setRoleError(messageOf(caught));
      } finally {
        setIsAssigningRole(false);
      }
    },
    [scoringService, refetch],
  );
  // Stable between renders on purpose: the table rebuilds its columns — and
  // throws away every row's cached score — whenever this changes.
  const onAssignRole = useCallback(
    (contributor: ContributorSummary, role: ContributorRole) => {
      void assignRole(contributor, role);
    },
    [assignRole],
  );
  // A second request over the same window, for the repository ranking alone.
  // Its failure is kept apart from the contributors' — the table is the tab's
  // subject, and hiding it because a card could not be filled would lose the
  // page over a corner of it. The card carries the reason instead.
  const repositoryLoad = useRepositories(dashboardService, range.window, enabled);
  // Refreshing re-reads the clock rather than replaying the stored window — see
  // `useTimeRange.advance`.
  const { interval, setInterval } = useAutoRefresh(range.advance, config.refreshIntervalMs);

  return (
    <>
      <ContentHeader title="Contributors">
        <DashboardToolbar
          lastFetchedAt={lastFetchedAt}
          refreshInterval={interval}
          isLoading={isLoading}
          ranges={range.ranges}
          months={range.months}
          selection={range.selection}
          onRangeChange={range.select}
          onRefresh={range.advance}
          onIntervalChange={setInterval}
        />
      </ContentHeader>

      {coverage.coverage && <BackfillProgress coverage={coverage.coverage} />}

      {error && (
        <Box mb={2}>
          <WarningPanel
            severity="error"
            title="Failed to load contributors"
            message={error}
            defaultExpanded
          />
        </Box>
      )}

      {roleError === null ? null : (
        <Box mb={2}>
          <WarningPanel
            severity="error"
            title="That role was not saved"
            message={roleError}
            defaultExpanded
          />
        </Box>
      )}

      <Box mb={3}>
        <Grid container spacing={3}>
          <ActivityRankings
            repositories={repositoryLoad.repositories}
            contributors={contributors}
            repositoriesError={repositoryLoad.error}
          />

          {capabilities.wakatime ? (
            <WakaTimeContributorInsights contributors={contributors} />
          ) : null}

          {capabilities.claude ? <ClaudeContributorInsights contributors={contributors} /> : null}

          {capabilities.jira ? (
            <JiraContributorInsights contributors={contributors} />
          ) : null}

          {capabilities.confluence ? (
            <ConfluenceContributorInsights contributors={contributors} />
          ) : null}
        </Grid>
      </Box>

      <ContributorsTable
        window={range.window}
        contributors={contributors}
        totalCount={contributors.length}
        isLoading={isLoading}
        capabilities={capabilities}
        weights={weights}
        canAssignRoles={canAssignRoles}
        onAssignRole={onAssignRole}
        isAssigningRole={isAssigningRole}
      />
    </>
  );
};
