import type {
  ContributorSummary,
  RepositorySummary,
  TimeSeriesBucket,
  TimeSeriesPoint,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContributorService,
  DashboardService,
  TimeSeriesService,
} from "../../domain/services/dashboard_service";

export interface UseInsightsResult {
  repositories: RepositorySummary[];
  contributors: ContributorSummary[];
  cadence: TimeSeriesPoint[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
  refetch: () => Promise<void>;
}

/**
 * Everything the Insights tab plots, fetched together.
 *
 * The three requests go out in parallel and land in one state update, so the
 * page never renders a half-built dashboard where the tiles have moved on to a
 * new range while the charts still show the old one.
 */
export const useInsights = (
  dashboardService: DashboardService,
  contributorService: ContributorService,
  timeSeriesService: TimeSeriesService,
  window: TimeWindow,
  bucket: TimeSeriesBucket,
  enabled: boolean,
): UseInsightsResult => {
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [contributors, setContributors] = useState<ContributorSummary[]>([]);
  const [cadence, setCadence] = useState<TimeSeriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Guards against an earlier, slower response overwriting a later one when the
  // range is changed twice in quick succession.
  const requestId = useRef(0);

  const fetchInsights = useCallback(async () => {
    if (!enabled) return;

    const current = requestId.current + 1;
    requestId.current = current;
    setIsLoading(true);
    setError(null);

    try {
      const [nextRepositories, nextContributors, nextCadence] = await Promise.all([
        dashboardService.listRepositories(window),
        contributorService.listContributors(window),
        timeSeriesService.getTimeSeries(window, bucket),
      ]);
      if (requestId.current !== current) return;

      setRepositories(nextRepositories);
      setContributors(nextContributors);
      setCadence(nextCadence);
      setLastFetchedAt(new Date());
    } catch (caught) {
      if (requestId.current !== current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [
    dashboardService,
    contributorService,
    timeSeriesService,
    window,
    bucket,
    enabled,
  ]);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  return {
    repositories,
    contributors,
    cadence,
    isLoading,
    error,
    lastFetchedAt,
    refetch: fetchInsights,
  };
};
