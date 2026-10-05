import type { CostTelemetry } from "@/backend";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatNumber } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Coins, Gauge, Layers, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface CostSummaryProps {
  telemetry: CostTelemetry | undefined;
  isLoading: boolean;
  className?: string;
}

interface Metric {
  key: string;
  label: string;
  value: string;
  unit: string;
  hint: string;
  icon: LucideIcon;
  accent?: boolean;
}

function buildMetrics(telemetry: CostTelemetry | undefined): Metric[] {
  const totalRuns = telemetry ? Number(telemetry.totalRuns) : 0;
  const totalBurn = telemetry?.totalTokenCostBurn ?? 0;
  const average = telemetry?.averageCostPerRun ?? 0;

  return [
    {
      key: "runs",
      label: "Total Runs",
      value: telemetry ? formatCompact(totalRuns) : "—",
      unit: "runs",
      hint: "Production runs recorded",
      icon: Layers,
    },
    {
      key: "burn",
      label: "Total Token Burn",
      value: telemetry ? formatCompact(totalBurn) : "—",
      unit: "tokens",
      hint: "Cumulative across all runs",
      icon: Coins,
      accent: true,
    },
    {
      key: "average",
      label: "Avg Cost / Run",
      value: telemetry ? formatNumber(average, 1) : "—",
      unit: "tokens",
      hint: "Mean burn per completed run",
      icon: TrendingUp,
    },
  ];
}

/**
 * Dense telemetry strip for the Cost & Token Tracker. Renders three
 * layout-matched metric tiles that update as polling refreshes.
 */
export function CostSummary({
  telemetry,
  isLoading,
  className,
}: CostSummaryProps) {
  const metrics = buildMetrics(telemetry);

  return (
    <section
      aria-label="Cost telemetry summary"
      className={cn("grid gap-3 sm:grid-cols-3", className)}
      data-ocid="costs.summary.section"
    >
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.key}
            data-ocid={`costs.summary.${metric.key}.card`}
            className={cn(
              "relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-panel",
              metric.accent && "border-primary/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {metric.label}
                </p>
                {isLoading ? (
                  <Skeleton className="mt-2 h-8 w-24" />
                ) : (
                  <p
                    className={cn(
                      "mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight",
                      metric.accent ? "text-primary" : "text-foreground",
                    )}
                  >
                    {metric.value}
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {metric.unit}
                </p>
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border",
                  metric.accent
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
              {metric.hint}
            </p>
          </div>
        );
      })}
    </section>
  );
}
