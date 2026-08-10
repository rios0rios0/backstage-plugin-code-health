import type {
  RepositorySummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardService } from "../../domain/services/dashboard_service";

export interface UseRepositoriesResult {
  repositories: RepositorySummary[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
  refetch: () => Promise<void>;
}

export const useRepositories = (
  dashboardService: DashboardService,
  window: TimeWindow,
  enabled: boolean,
): UseRepositoriesResult => {
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Incremented per request so a slow reply for a window the user has already
  // moved on from cannot overwrite the one they are looking at.
  const requestId = useRef(0);

  const fetchRepositories = useCallback(async () => {
    if (!enabled) return;

    const current = requestId.current + 1;
    requestId.current = current;
    setIsLoading(true);
    setError(null);

    try {
      const items = await dashboardService.listRepositories(window);
      if (requestId.current !== current) return;
      setRepositories(items);
      setLastFetchedAt(new Date());
    } catch (caught) {
      if (requestId.current !== current) return;
      setError(caught instanceof Error ? caught.message : "Failed to fetch repositories");
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [dashboardService, enabled, window]);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  return { repositories, isLoading, error, lastFetchedAt, refetch: fetchRepositories };
};
