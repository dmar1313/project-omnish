import { useEffect, useRef } from "react";

export interface PollingOptions {
  /** Poll interval in milliseconds. */
  intervalMs?: number;
  /** When false, polling is suspended. */
  enabled?: boolean;
}

/**
 * Runs `callback` on an interval while `enabled` is true.
 *
 * The latest callback is held in a ref so callers can pass an inline closure
 * without restarting the interval on every render. The interval is cleared on
 * unmount and whenever `enabled` or `intervalMs` changes.
 */
export function usePolling(
  callback: () => void,
  { intervalMs = 5000, enabled = true }: PollingOptions = {},
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      callbackRef.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
}
