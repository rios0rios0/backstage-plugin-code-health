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

/**
 * The contributors of a window, or of one repository inside it.
 *
 * `repositoryId` narrows the same read the Contributors tab makes, which is
 * what a repository's page asks for when it wants to know who works on it —
 * the same rows, computed by the same code, so the two screens can never
 * disagree about who a person is.
 */
export const useContributors = (
  contributorService: ContributorService,
  window: TimeWindow,
  enabled: boolean,
  repositoryId?: string,
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
      const items = await contributorService.listContributors(window, repositoryId);
      if (requestId.current !== current) return;
      setContributors(items);
      setLastFetchedAt(new Date());
    } catch (caught) {
      if (requestId.current !== current) return;
      setError(caught instanceof Error ? caught.message : "Failed to fetch contributors");
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [contributorService, enabled, window, repositoryId]);

  useEffect(() => {
    fetchContributors();
  }, [fetchContributors]);

  return { contributors, isLoading, error, lastFetchedAt, refetch: fetchContributors };
};
