import { useCallback, useEffect, useRef, useState } from "react";

export type RefreshInterval = 60000 | 300000 | 900000 | 0;

export interface UseAutoRefreshResult {
  interval: RefreshInterval;
  setInterval: (interval: RefreshInterval) => void;
}

export const useAutoRefresh = (onRefresh: () => void, initialInterval: RefreshInterval = 300000): UseAutoRefreshResult => {
  const [interval, setIntervalValue] = useState<RefreshInterval>(initialInterval);
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
