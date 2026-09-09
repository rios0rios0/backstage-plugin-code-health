import type {
  OwnershipInfo,
  RepositorySummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OwnershipService } from "../../domain/services/dashboard_service";

export interface UseOwnedRepositoriesResult {
  /** Who the person is in the catalog, or null before the first answer lands. */
  ownership: OwnershipInfo | null;
  repositories: RepositorySummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * The repositories a person is responsible for, over the selected window.
 *
 * `ownership` is kept beside the rows rather than derived from them, because
 * an empty list has three different meanings — the account is linked to nobody,
 * the person owns nothing, or the catalog names their group and nothing else —
 * and only the ownership half of the answer tells them apart.
 *
 * The window is a dependency: ownership itself does not move with it, but the
 * rows are ordinary summaries whose health is measured over the window, so a
 * wider range has to re-read them.
 */
export const useOwnedRepositories = (
  ownershipService: OwnershipService,
  key: string | null,
  window: TimeWindow,
): UseOwnedRepositoriesResult => {
  const [ownership, setOwnership] = useState<OwnershipInfo | null>(null);
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const fetchOwned = useCallback(async () => {
    if (key === null) return;

    const current = requestId.current + 1;
    requestId.current = current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await ownershipService.listOwnedRepositories(key, window);
      if (requestId.current !== current) return;
      setOwnership(response.ownership);
      setRepositories([...response.items]);
    } catch (caught) {
      if (requestId.current !== current) return;
      setError(
        caught instanceof Error ? caught.message : "Failed to fetch the owned repositories",
      );
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [ownershipService, key, window]);

  useEffect(() => {
    void fetchOwned();
  }, [fetchOwned]);

  return { ownership, repositories, isLoading, error, refetch: fetchOwned };
};
