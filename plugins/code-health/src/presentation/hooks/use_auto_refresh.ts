import { useCallback, useEffect, useRef, useState } from "react";

export type RefreshInterval = 60000 | 300000 | 900000 | 0;

export const DEFAULT_REFRESH_INTERVAL: RefreshInterval = 300000;

const SUPPORTED: readonly RefreshInterval[] = [60000, 300000, 900000, 0];

/**
 * Coerces a configured value onto one of the intervals the picker offers, so a
 * number nobody can select cannot become the selected one.
 */
export const toRefreshInterval = (value: number | null | undefined): RefreshInterval =>
  SUPPORTED.find((supported) => supported === value) ?? DEFAULT_REFRESH_INTERVAL;

export interface UseAutoRefreshResult {
  interval: RefreshInterval;
  setInterval: (interval: RefreshInterval) => void;
}

export const useAutoRefresh = (
  onRefresh: () => void,
  configuredInterval?: number | null,
): UseAutoRefreshResult => {
  const [interval, setIntervalValue] = useState<RefreshInterval>(
    toRefreshInterval(configuredInterval),
  );
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      globalThis.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    if (interval > 0) {
      timerRef.current = globalThis.setInterval(onRefresh, interval);
    }
    return clearTimer;
  }, [interval, onRefresh, clearTimer]);

  const setInterval = useCallback((newInterval: RefreshInterval) => {
    setIntervalValue(newInterval);
  }, []);

  return { interval, setInterval };
};
