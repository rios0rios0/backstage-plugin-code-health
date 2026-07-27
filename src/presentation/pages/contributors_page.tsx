import { useCallback } from "react";
import Box from "@material-ui/core/Box";
import { ContentHeader, WarningPanel } from "@backstage/core-components";
import type { ContributorService } from "../../domain/services/contributor_service";
import { ContributorsTable } from "../components/contributors_table";
import { DashboardToolbar } from "../components/dashboard_toolbar";
import { useAutoRefresh } from "../hooks/use_auto_refresh";
import { useContributors } from "../hooks/use_contributors";

interface ContributorsPageProps {
  contributorService: ContributorService;
  /** Skips fetching while the plugin has no usable credentials. */
  enabled?: boolean;
}

export const ContributorsPage = ({
  contributorService,
  enabled = true,
}: ContributorsPageProps) => {
  const { contributors, isLoading, error, lastFetchedAt, refetch } = useContributors(
    contributorService,
    enabled,
  );
  const { interval, setInterval } = useAutoRefresh(refetch);

  const handleDateRangeApply = useCallback(
    (dateFrom: string | null, dateTo: string | null) => {
      refetch(dateFrom, dateTo);
    },
    [refetch],
  );

  return (
    <>
      <ContentHeader title="Contributors">
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
        onDateRangeApply={handleDateRangeApply}
      />
    </>
  );
};
