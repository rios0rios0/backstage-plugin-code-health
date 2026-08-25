import { ContentHeader, WarningPanel } from "@backstage/core-components";
import Box from "@material-ui/core/Box";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import type { ContributorService } from "../../domain/services/dashboard_service";
import { BackfillProgress } from "../components/backfill_progress";
import { ContributorsTable } from "../components/contributors_table";
import { DashboardToolbar } from "../components/dashboard_toolbar";
import { useAutoRefresh } from "../hooks/use_auto_refresh";
import { useContributors } from "../hooks/use_contributors";
import type { UseCoverageResult } from "../hooks/use_coverage";
import { useTimeRange } from "../hooks/use_time_range";

interface ContributorsPageProps {
  contributorService: ContributorService;
  coverage: UseCoverageResult;
  config: CodeHealthConfig;
  /** Skips fetching, used while the coverage probe is still in flight. */
  enabled?: boolean;
}

export const ContributorsPage = ({
  contributorService,
  coverage,
  config,
  enabled = true,
}: ContributorsPageProps) => {
  const range = useTimeRange(coverage.coverage, config.defaultRange);
  const { contributors, isLoading, error, lastFetchedAt } = useContributors(
    contributorService,
    range.window,
    enabled,
  );
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

      <ContributorsTable
        contributors={contributors}
        totalCount={contributors.length}
        isLoading={isLoading}
      />
    </>
  );
};
