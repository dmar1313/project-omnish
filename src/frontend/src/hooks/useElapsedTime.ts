import { useEffect, useState } from "react";

/**
 * Live elapsed time since a backend `startedAt` timestamp, in milliseconds.
 *
 * Motoko `Time.now()` is a nanosecond bigint, so the value is converted before
 * any JavaScript date math. The hook ticks once per second while `active` is
 * true and freezes at the last computed value when it turns false, so a
 * finished generation keeps showing its final duration.
 */
export function useElapsedTime(
  startedAt: bigint | null | undefined,
  active: boolean,
): number {
  const [now, setNow] = useState(() => Date.now());

  // A new generation (a fresh start timestamp) resets the baseline immediately,
  // even when `active` stays true across the transition — otherwise the timer
  // would keep counting from the old start until the next tick.
  useEffect(() => {
    if (startedAt === null || startedAt === undefined) return;
    setNow(Date.now());
  }, [startedAt]);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (startedAt === null || startedAt === undefined) return 0;
  const startedMs = Number(startedAt / 1_000_000n);
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, now - startedMs);
}

/** Formats a millisecond duration as `m:ss` (or `h:mm:ss` past an hour). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}
