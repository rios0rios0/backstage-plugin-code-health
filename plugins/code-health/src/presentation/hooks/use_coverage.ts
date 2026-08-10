import type { CoverageInfo } from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useState } from "react";
import type { CoverageService } from "../../domain/services/dashboard_service";

export interface UseCoverageResult {
  coverage: CoverageInfo | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Reads how much history the backend holds.
 *
 * The dashboard needs this before it can offer a range picker: on a fresh
 * install only the last day is answerable, and the wider options appear as the
 * backfill walks outwards. A failure here is reported rather than swallowed,
 * because "the backend is not installed" and "the backfill has not started" look
 * identical from an empty dashboard.
 */
export const useCoverage = (coverageService: CoverageService): UseCoverageResult => {
  const [coverage, setCoverage] = useState<CoverageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setCoverage(await coverageService.getCoverage());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to read ingestion coverage");
    } finally {
      setIsLoading(false);
    }
  }, [coverageService]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { coverage, isLoading, error, reload };
};
