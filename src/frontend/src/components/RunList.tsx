import type { DnaRecord, RunDecisionState, RunSummary } from "@/backend";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompact,
  formatRelative,
  isActiveRun,
  isDecidedDecision,
  runDecisionMeta,
  runStatusMeta,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Inbox } from "lucide-react";

export interface RunListProps {
  runs: RunSummary[];
  dna: DnaRecord[];
  isLoading: boolean;
  isError: boolean;
  /**
   * Decision state keyed by run id. When a run has been approved or rejected,
   * its decision badge replaces the run status so the feed reflects the
   * operator's decision after returning from the Simulation Inspector.
   */
  decisions?: Map<string, RunDecisionState>;
}

function characterName(dna: DnaRecord[], id?: bigint): string {
  if (id === undefined) return "Unassigned";
  const record = dna.find((item) => item.id === id);
  return record?.characterName ?? `Character #${id.toString()}`;
}

export function RunList({
  runs,
  dna,
  isLoading,
  isError,
  decisions,
}: RunListProps) {
  return (
    <section
      className="flex flex-col rounded-lg border border-border bg-card shadow-panel"
      data-ocid="feed.runs.panel"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold tracking-tight">
          Active &amp; Recent Runs
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {runs.length} total
        </span>
      </header>

      {isLoading ? (
        <div
          className="flex flex-col gap-2 p-4"
          data-ocid="feed.runs.loading_state"
        >
          {Array.from({ length: 4 }, (_, i) => `run-skeleton-${i}`).map(
            (id) => (
              <Skeleton key={id} className="h-14 w-full rounded-md" />
            ),
          )}
        </div>
      ) : isError ? (
        <p
          className="p-6 text-center text-sm text-destructive"
          data-ocid="feed.runs.error_state"
        >
          Could not load production runs.
        </p>
      ) : runs.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 px-4 py-12 text-center"
          data-ocid="feed.runs.empty_state"
        >
          <Inbox className="size-6 text-muted-foreground" />
          <p className="text-sm text-foreground">No production runs yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Compose a prompt above and start a run to populate the feed.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border" data-ocid="feed.runs.list">
          {runs.map((run, index) => {
            const decision = decisions?.get(run.id.toString());
            const decided = isDecidedDecision(decision?.decision);
            const meta =
              decided && decision
                ? runDecisionMeta(decision.decision)
                : runStatusMeta(run.status);
            const active = isActiveRun(run.status) && !decided;
            return (
              <li key={run.id.toString()}>
                <Link
                  to="/simulation"
                  search={{ runId: run.id.toString() }}
                  data-ocid={`feed.runs.item.${index + 1}`}
                  className={cn(
                    "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50",
                    active && "bg-primary/5",
                  )}
                >
                  <span className="flex w-16 shrink-0 flex-col">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Run
                    </span>
                    <span className="font-mono text-xs text-foreground">
                      #{run.id.toString()}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {characterName(dna, run.characterId)}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatRelative(run.timestamp)}
                    </span>
                  </span>

                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Tokens
                    </span>
                    <span className="block font-mono text-xs text-foreground font-tabular">
                      {formatCompact(run.tokenCostBurn)}
                    </span>
                  </span>

                  <StatusBadge
                    label={meta.label}
                    tone={meta.tone}
                    pulse={active}
                  />

                  <span
                    className="hidden shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary sm:inline-flex"
                    data-ocid={`feed.runs.view_results.${index + 1}`}
                  >
                    View results
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </span>

                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary sm:hidden" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
