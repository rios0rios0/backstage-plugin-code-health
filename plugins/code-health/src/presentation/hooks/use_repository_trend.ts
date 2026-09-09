import type {
  GetRepositoryTrendResponse,
  TimeSeriesBucket,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrendService } from "../../domain/services/dashboard_service";

export interface UseRepositoryTrendResult {
  trend: GetRepositoryTrendResponse | null;
  isLoading: boolean;
  error: string | null;
  /** True when the backend has no repository under that id at all. */
  isMissing: boolean;
  refetch: () => Promise<void>;
}

/**
 * What the backend says when the id names nothing it tracks.
 *
 * Matched on the message rather than on a status code because the client
 * surfaces failures as plain `Error`s, and this is the one failure that is not
 * a fault: a bookmark outliving a repository's catalog entity is ordinary, and
 * "this repository is not tracked" is a completely different thing to put on
 * the screen from "the backend is broken".
 */
const NOT_TRACKED = "no repository with id";

export const isRepositoryMissing = (message: string): boolean =>
  message.toLowerCase().startsWith(NOT_TRACKED);

/**
 * One repository's bucketed history.
 *
 * Keyed on the window and the bucket the range picker settled on, so choosing
 * a wider range refetches and nothing else does. The request-id guard is the
 * same one the Insights hook carries: flipping the range twice quickly must not
 * let the first, slower reply overwrite the second.
 */
export const useRepositoryTrend = (
  trendService: TrendService,
  id: string | null,
  window: TimeWindow,
  bucket: TimeSeriesBucket,
  enabled: boolean,
): UseRepositoryTrendResult => {
  const [trend, setTrend] = useState<GetRepositoryTrendResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMissing, setIsMissing] = useState(false);

  const requestId = useRef(0);

  const fetchTrend = useCallback(async () => {
    if (!enabled || id === null) return;

    const current = requestId.current + 1;
    requestId.current = current;
    setIsLoading(true);
    setError(null);
    setIsMissing(false);

    try {
      const next = await trendService.getRepositoryTrend(id, window, bucket);
      if (requestId.current !== current) return;
      setTrend(next);
    } catch (caught) {
      if (requestId.current !== current) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setIsMissing(isRepositoryMissing(message));
      // A stale row would otherwise stay on screen underneath the warning,
      // reading as though the failed range had been answered.
      setTrend(null);
    } finally {
      if (requestId.current === current) setIsLoading(false);
    }
  }, [trendService, id, window, bucket, enabled]);

  useEffect(() => {
    void fetchTrend();
  }, [fetchTrend]);

  return { trend, isLoading, error, isMissing, refetch: fetchTrend };
};
