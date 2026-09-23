import type { ProductivityWeightsByRole } from "@rios0rios0/backstage-plugin-code-health-common";
import { DEFAULT_PRODUCTIVITY_WEIGHTS } from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useState } from "react";
import type { ScoringService } from "../../domain/services/dashboard_service";

export interface UseProductivityWeightsResult {
  readonly weights: ProductivityWeightsByRole;
  readonly isLoading: boolean;
  /** Re-reads the weights, after an administrator has changed them. */
  readonly reload: () => Promise<void>;
}

/**
 * The weights each role is scored on, asked once and again after a change.
 *
 * A failure is not surfaced, for the same reason the capabilities probe stays
 * quiet: the tabs already carry a reachability gate, and a backend that cannot
 * answer — or one a release behind, which has no such route — reads as the
 * defaults, which is exactly what it would score a person on. The table then
 * folds the same numbers the backend does.
 */
export const useProductivityWeights = (service: ScoringService): UseProductivityWeightsResult => {
  const [weights, setWeights] = useState<ProductivityWeightsByRole>(DEFAULT_PRODUCTIVITY_WEIGHTS);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setWeights(await service.getProductivityWeights());
    } catch {
      setWeights(DEFAULT_PRODUCTIVITY_WEIGHTS);
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { weights, isLoading, reload };
};
