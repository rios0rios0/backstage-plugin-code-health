import type {
  ContributorSummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContributorService } from "../../domain/services/dashboard_service";

export interface UseContributorsResult {
  contributors: ContributorSummary[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
  refetch: () => Promise<void>;
}

export const useContributors = (
  contributorService: ContributorService,
  window: TimeWindow,
  enabled: boolean,
): UseContributorsResult => {
  const [contributors, setContributors] = useState<ContributorSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const requestId = useRef(0);

  const fetchContributors = useCallback(async () => {
    if (!enabled) return;

    const current = requestId.current + 1;
    requestId.current = current;
    setIsLoading(true);
    setError(null);

    try {
      const items = await contributorService.listContributors(window);
      if (requestId.current !== current) return;
      setContributors(items);
      setLastFetchedAt(new Date());
    } catch (caught) {
      if (requestId.current !== current) return;
      setError(caught instanceof Error ? caught.message : "Failed to fetch contributors");
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [contributorService, enabled, window]);

  useEffect(() => {
    fetchContributors();
  }, [fetchContributors]);

  return { contributors, isLoading, error, lastFetchedAt, refetch: fetchContributors };
};
