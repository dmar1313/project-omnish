import type { CostTelemetry, RunSummary } from "@/backend";
import { BurnTrend } from "@/components/BurnTrend";
import { CostSummary } from "@/components/CostSummary";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBackend } from "@/hooks/useBackend";
import { usePolling } from "@/hooks/usePolling";
import { backendErrorMessage } from "@/lib/backendClient";
import {
  formatCompact,
  formatNumber,
  formatTimestamp,
  runStatusMeta,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Gauge, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

type SortKey = "timestamp" | "tokenCostBurn";
type SortDir = "asc" | "desc";

const POLL_INTERVAL_MS = 8000;

export default function CostsPage() {
  const { actor, isReady } = useBackend();
  const queryClient = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const telemetryQuery = useQuery<CostTelemetry>({
    queryKey: ["costTelemetry"],
    queryFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.getCostTelemetry();
    },
    enabled: isReady,
  });

  const runsQuery = useQuery<RunSummary[]>({
    queryKey: ["runs"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRuns();
    },
    enabled: isReady,
  });

  usePolling(
    () => {
      void queryClient.invalidateQueries({ queryKey: ["costTelemetry"] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    { intervalMs: POLL_INTERVAL_MS, enabled: isReady },
  );

  const runs = runsQuery.data ?? [];

  const sortedRuns = useMemo(() => {
    const copy = [...runs];
    copy.sort((a, b) => {
      const delta =
        sortKey === "timestamp"
          ? Number(a.timestamp - b.timestamp)
          : a.tokenCostBurn - b.tokenCostBurn;
      return sortDir === "asc" ? delta : -delta;
    });
    return copy;
  }, [runs, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  const isError = telemetryQuery.isError || runsQuery.isError;
  const isLoading = telemetryQuery.isLoading || runsQuery.isLoading;

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["costTelemetry"] });
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="costs.page"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
            <Gauge className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Cost &amp; Token Tracker
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggregate token burn, per-run cost, and entropy budget telemetry.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 sm:flex">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-status-running animate-live-blink"
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Live · {POLL_INTERVAL_MS / 1000}s
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 rounded-md"
            onClick={handleRefresh}
            disabled={!isReady}
            data-ocid="costs.refresh_button"
          >
            <RefreshCw
              className={cn(
                "size-4",
                (telemetryQuery.isFetching || runsQuery.isFetching) &&
                  "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      {isError ? (
        <div
          className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
          data-ocid="costs.error_state"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Telemetry unavailable
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {backendErrorMessage(telemetryQuery.error ?? runsQuery.error)}
            </p>
          </div>
        </div>
      ) : null}

      <CostSummary
        telemetry={telemetryQuery.data}
        isLoading={isLoading}
        className="mb-4"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <BurnTrend runs={runs} isLoading={isLoading} />

        <section
          aria-label="Per-run cost breakdown"
          className="rounded-lg border border-border bg-card shadow-panel"
          data-ocid="costs.table.section"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Per-Run Breakdown
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {runs.length} {runs.length === 1 ? "run" : "runs"}
            </span>
          </div>

          {isLoading ? (
            <div
              className="space-y-2 p-4"
              data-ocid="costs.table.loading_state"
            >
              {Array.from({ length: 5 }, (_, i) => `run-skeleton-${i}`).map(
                (id) => (
                  <div
                    key={id}
                    className="h-9 animate-pulse rounded-sm bg-secondary"
                  />
                ),
              )}
            </div>
          ) : sortedRuns.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-4 py-16"
              data-ocid="costs.table.empty_state"
            >
              <Gauge
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                No production runs recorded
              </p>
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                Start a production run from the Live Feed to populate cost
                telemetry.
              </p>
            </div>
          ) : (
            <Table data-ocid="costs.table">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Run ID
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Character
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort("tokenCostBurn")}
                      className="ml-auto inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground"
                      data-ocid="costs.table.sort_cost_button"
                    >
                      Token Cost
                      <span aria-hidden="true">
                        {sortIndicator("tokenCostBurn")}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort("timestamp")}
                      className="ml-auto inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground"
                      data-ocid="costs.table.sort_time_button"
                    >
                      Timestamp
                      <span aria-hidden="true">
                        {sortIndicator("timestamp")}
                      </span>
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRuns.map((run, index) => {
                  const meta = runStatusMeta(run.status);
                  return (
                    <TableRow
                      key={String(run.id)}
                      data-ocid={`costs.table.row.${index + 1}`}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{String(run.id)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {run.characterId !== undefined
                          ? `Character #${String(run.characterId)}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={meta.label}
                          tone={meta.tone}
                          pulse={meta.tone === "running"}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                        {formatNumber(run.tokenCostBurn, 1)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatTimestamp(run.timestamp)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {!isLoading && sortedRuns.length > 0 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Sorted by {sortKey === "timestamp" ? "time" : "cost"}</span>
              <span className="text-primary">
                Σ{" "}
                {formatCompact(
                  sortedRuns.reduce((sum, run) => sum + run.tokenCostBurn, 0),
                )}{" "}
                tokens
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
