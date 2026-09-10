import type {
  GetContributorTrendResponse,
  TimeSeriesBucket,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrendService } from "../../domain/services/dashboard_service";

export interface UseContributorTrendResult {
  trend: GetContributorTrendResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * One person's history over the selected window.
 *
 * `key` is null when the page was opened without one, and nothing is asked for
 * then: a request for the empty key would come back as a person who recorded
 * nothing, which is exactly the answer a stale link deserves and exactly the
 * wrong answer to "you followed a link with no name in it".
 *
 * The response is replaced wholesale rather than merged, so the summary, the
 * score and the points on screen always describe the same window — a page that
 * headed itself with last quarter's totals over this quarter's charts would be
 * wrong in a way nobody would spot.
 */
export const useContributorTrend = (
  trendService: TrendService,
  key: string | null,
  window: TimeWindow,
  bucket: TimeSeriesBucket,
): UseContributorTrendResult => {
  const [trend, setTrend] = useState<GetContributorTrendResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against an earlier, slower response overwriting a later one when the
  // range is changed twice in quick succession.
  const requestId = useRef(0);

  const fetchTrend = useCallback(async () => {
    if (key === null) return;

    const current = requestId.current + 1;
    requestId.current = current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await trendService.getContributorTrend(key, window, bucket);
      if (requestId.current !== current) return;
      setTrend(response);
    } catch (caught) {
      if (requestId.current !== current) return;
      setError(
        caught instanceof Error ? caught.message : "Failed to fetch the contributor trend",
      );
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [trendService, key, window, bucket]);

  useEffect(() => {
    void fetchTrend();
  }, [fetchTrend]);

  return { trend, isLoading, error, refetch: fetchTrend };
};
