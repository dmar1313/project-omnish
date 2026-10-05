import type { RunSummary } from "@/backend";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatTimestamp } from "@/lib/status";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

export interface BurnTrendProps {
  runs: RunSummary[];
  isLoading: boolean;
  className?: string;
}

const MAX_BARS = 16;

/**
 * Compact bar trend of token burn across the most recent runs. Bars are
 * ordered oldest → newest so the signal-orange accent reads as a live
 * burn-rate trace. Pure CSS bars keep it dependency-free and responsive.
 */
export function BurnTrend({ runs, isLoading, className }: BurnTrendProps) {
  const recent = [...runs]
    .sort((a, b) => Number(a.timestamp - b.timestamp))
    .slice(-MAX_BARS);

  const peak = recent.reduce((max, run) => Math.max(max, run.tokenCostBurn), 0);
  const hasData = recent.length > 0 && peak > 0;

  return (
    <section
      aria-label="Token burn trend"
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-panel",
        className,
      )}
      data-ocid="costs.trend.section"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">
            Burn Trend
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Last {recent.length || 0} runs
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-end gap-1.5" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => `trend-skeleton-${i}`).map(
            (id) => (
              <Skeleton key={id} className="h-full flex-1 rounded-sm" />
            ),
          )}
        </div>
      ) : hasData ? (
        <div
          className="flex h-40 items-end gap-1.5"
          data-ocid="costs.trend.chart"
        >
          {recent.map((run, index) => {
            const heightPct = Math.max(
              6,
              Math.round((run.tokenCostBurn / peak) * 100),
            );
            const isLatest = index === recent.length - 1;
            return (
              <div
                key={String(run.id)}
                className="group relative flex h-full flex-1 flex-col justify-end"
                data-ocid={`costs.trend.bar.${index + 1}`}
              >
                <div
                  className={cn(
                    "w-full rounded-sm transition-colors",
                    isLatest
                      ? "bg-primary"
                      : "bg-primary/35 group-hover:bg-primary/60",
                  )}
                  style={{ height: `${heightPct}%` }}
                />
                <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-sm border border-border bg-popover px-2 py-1 font-mono text-[10px] text-popover-foreground shadow-elevated group-hover:block">
                  {formatCompact(run.tokenCostBurn)} ·{" "}
                  {formatTimestamp(run.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40"
          data-ocid="costs.trend.empty_state"
        >
          <BarChart3
            className="size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            No burn recorded yet
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Oldest</span>
        <span className="text-primary">Peak {formatCompact(peak)}</span>
        <span>Newest</span>
      </div>
    </section>
  );
}
