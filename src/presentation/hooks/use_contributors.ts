import { useCallback, useEffect, useState } from "react";
import type { Contributor } from "../../domain/entities/contributor";
import type { ContributorService } from "../../domain/services/contributor_service";

export interface UseContributorsResult {
  contributors: Contributor[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
  refetch: (dateFrom?: string | null, dateTo?: string | null) => Promise<void>;
}

export const useContributors = (
  contributorService: ContributorService,
  enabled: boolean,
): UseContributorsResult => {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const fetchContributors = useCallback(
    async (dateFrom: string | null = null, dateTo: string | null = null) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await contributorService.listContributors(dateFrom, dateTo);
        setContributors(data);
        setLastFetchedAt(new Date());
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch contributors";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [contributorService, enabled],
  );

  useEffect(() => {
    fetchContributors();
  }, [fetchContributors]);

  return { contributors, isLoading, error, lastFetchedAt, refetch: fetchContributors };
};
