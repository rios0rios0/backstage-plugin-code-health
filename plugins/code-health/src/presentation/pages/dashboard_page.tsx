import { ContentHeader, WarningPanel } from "@backstage/core-components";
import Box from "@material-ui/core/Box";
import type { IntegrationCapabilities } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import type { DashboardService } from "../../domain/services/dashboard_service";
import { BackfillProgress } from "../components/backfill_progress";
import { DashboardToolbar } from "../components/dashboard_toolbar";
import { RepositoryTable } from "../components/repository_table";
import { useAutoRefresh } from "../hooks/use_auto_refresh";
import type { UseCoverageResult } from "../hooks/use_coverage";
import { useRepositories } from "../hooks/use_repositories";
import { useTimeRange } from "../hooks/use_time_range";

interface DashboardPageProps {
  dashboardService: DashboardService;
  coverage: UseCoverageResult;
  config: CodeHealthConfig;
  capabilities: IntegrationCapabilities;
  /** Skips fetching, used while the coverage probe is still in flight. */
  enabled?: boolean;
}

export const DashboardPage = ({
  dashboardService,
  coverage,
  config,
  capabilities,
  enabled = true,
}: DashboardPageProps) => {
  const range = useTimeRange(coverage.coverage, config.defaultRange);
  const { repositories, isLoading, error, lastFetchedAt } = useRepositories(
    dashboardService,
    range.window,
    enabled,
  );
  // Refreshing re-reads the clock rather than replaying the stored window, so a
  // rolling range actually moves forward instead of asking for the same period
  // it was selected with. The new window is what triggers the refetch.
  const { interval, setInterval } = useAutoRefresh(range.advance, config.refreshIntervalMs);

  return (
    <>
      <ContentHeader title="Repositories">
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
            title="Failed to load repositories"
            message={error}
            defaultExpanded
          />
        </Box>
      )}

      <RepositoryTable
        repositories={repositories}
        totalCount={repositories.length}
        isLoading={isLoading}
        capabilities={capabilities}
      />
    </>
  );
};
