import { formatElapsed, useElapsedTime } from "@/hooks/useElapsedTime";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit cover for the elapsed-time indicator used by the generating state.
 *
 * `useElapsedTime` converts a Motoko nanosecond `startedAt` bigint into a live
 * millisecond duration that ticks once per second while active and freezes when
 * inactive; `formatElapsed` renders it as m:ss (h:mm:ss past an hour).
 */

describe("formatElapsed", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5_000)).toBe("0:05");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_599_000)).toBe("59:59");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
  });

  it("clamps negative durations to zero", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});

describe("useElapsedTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero when there is no start timestamp", () => {
    const { result } = renderHook(() => useElapsedTime(null, true));
    expect(result.current).toBe(0);
  });

  it("computes elapsed milliseconds from a nanosecond timestamp", () => {
    // 5 seconds before the frozen system time.
    const startedAt = BigInt(Date.now() - 5_000) * 1_000_000n;
    const { result } = renderHook(() => useElapsedTime(startedAt, true));
    expect(result.current).toBe(5_000);
  });

  it("ticks while active and freezes when inactive", () => {
    const startedAt = BigInt(Date.now()) * 1_000_000n;
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useElapsedTime(startedAt, active),
      { initialProps: { active: true } },
    );

    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(3_000);

    // Once inactive the interval stops and the value freezes.
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(3_000);
  });

  it("resets the baseline when a new generation starts while still active", () => {
    const firstStart = BigInt(Date.now()) * 1_000_000n;
    const { result, rerender } = renderHook(
      ({ startedAt }: { startedAt: bigint }) => useElapsedTime(startedAt, true),
      { initialProps: { startedAt: firstStart } },
    );

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current).toBe(4_000);

    // A new generation carries a fresh start timestamp; the timer must restart
    // from zero rather than keep counting from the previous run's start.
    const secondStart = BigInt(Date.now()) * 1_000_000n;
    rerender({ startedAt: secondStart });

    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(2_000);
  });
});
