import Box from "@material-ui/core/Box";
import { ContentHeader, WarningPanel } from "@backstage/core-components";
import type { DashboardService } from "../../domain/services/dashboard_service";
import { DashboardToolbar } from "../components/dashboard_toolbar";
import { RepositoryTable } from "../components/repository_table";
import { useAutoRefresh } from "../hooks/use_auto_refresh";
import { useRepositories } from "../hooks/use_repositories";

interface DashboardPageProps {
  dashboardService: DashboardService;
  /** Skips fetching while the plugin has no usable credentials. */
  enabled?: boolean;
}

export const DashboardPage = ({ dashboardService, enabled = true }: DashboardPageProps) => {
  const { repositories, isLoading, error, lastFetchedAt, refetch } = useRepositories(
    dashboardService,
    enabled,
  );
  const { interval, setInterval } = useAutoRefresh(refetch);

  return (
    <>
      <ContentHeader title="Repositories">
        <DashboardToolbar
          lastFetchedAt={lastFetchedAt}
          refreshInterval={interval}
          isLoading={isLoading}
          onRefresh={refetch}
          onIntervalChange={setInterval}
        />
      </ContentHeader>

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
      />
    </>
  );
};
