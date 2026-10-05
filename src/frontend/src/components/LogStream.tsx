import type { SimulationLog } from "@/backend";
import { SimulationStep } from "@/backend";
import { formatTimestamp, simulationStepLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";
import { useMemo, useState } from "react";

export interface LogStreamProps {
  logs: SimulationLog[];
  /** When true, the stream is actively receiving new entries. */
  live?: boolean;
  className?: string;
}

const STEP_ORDER: SimulationStep[] = [
  SimulationStep.ingestion,
  SimulationStep.asset_binding,
  SimulationStep.dna_crossref,
  SimulationStep.lore_check,
  SimulationStep.fracture,
];

const STEP_ACCENT: Record<SimulationStep, string> = {
  [SimulationStep.ingestion]: "text-chart-3",
  [SimulationStep.asset_binding]: "text-chart-4",
  [SimulationStep.dna_crossref]: "text-chart-1",
  [SimulationStep.lore_check]: "text-status-pending",
  [SimulationStep.fracture]: "text-status-halted",
};

type StepFilter = SimulationStep | "all";

/**
 * Recessed terminal surface streaming each pipeline step's evaluation output.
 * Filterable by step; each line carries its timestamp and step label.
 */
export function LogStream({ logs, live = false, className }: LogStreamProps) {
  const [filter, setFilter] = useState<StepFilter>("all");

  const presentSteps = useMemo(() => {
    const seen = new Set(logs.map((log) => log.stepName));
    return STEP_ORDER.filter((step) => seen.has(step));
  }, [logs]);

  const visibleLogs = useMemo(() => {
    const ordered = [...logs].sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
    );
    if (filter === "all") return ordered;
    return ordered.filter((log) => log.stepName === filter);
  }, [logs, filter]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-terminal-border bg-terminal shadow-inset-terminal",
        className,
      )}
      data-ocid="simulation.log_stream.panel"
      aria-label="Simulation log stream"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-terminal-border px-3 py-2">
        <span className="flex items-center gap-2 text-terminal-foreground">
          <Terminal className="size-3.5" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]">
            Evaluation Stream
          </span>
        </span>

        {live ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-status-running animate-live-blink"
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-status-running">
              Live
            </span>
          </span>
        ) : null}

        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
          {visibleLogs.length} / {logs.length} lines
        </span>
      </header>

      <fieldset className="flex flex-wrap items-center gap-1 border-b border-terminal-border px-3 py-2">
        <legend className="sr-only">Filter logs by pipeline step</legend>
        <FilterChip
          active={filter === "all"}
          label="All"
          onClick={() => setFilter("all")}
          ocid="simulation.log_filter.all.tab"
        />
        {presentSteps.map((step) => (
          <FilterChip
            key={step}
            active={filter === step}
            label={simulationStepLabel(step)}
            onClick={() => setFilter(step)}
            ocid={`simulation.log_filter.${step}.tab`}
          />
        ))}
      </fieldset>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {visibleLogs.length === 0 ? (
          <p
            className="py-8 text-center font-mono text-xs text-muted-foreground"
            data-ocid="simulation.log_stream.empty_state"
          >
            {logs.length === 0
              ? "Awaiting pipeline telemetry…"
              : "No log lines match this step filter."}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {visibleLogs.map((log) => (
              <li
                key={String(log.id)}
                className="animate-log-in rounded-sm border-l-2 border-terminal-border bg-black/20 px-2.5 py-1.5"
                data-ocid="simulation.log_stream.item"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px] font-semibold uppercase tracking-wider",
                      STEP_ACCENT[log.stepName] ?? "text-terminal-foreground",
                    )}
                  >
                    {simulationStepLabel(log.stepName)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-terminal-foreground">
                  {log.evaluationOutput}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

interface FilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  ocid: string;
}

function FilterChip({ active, label, onClick, ocid }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-ocid={ocid}
      className={cn(
        "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-terminal-border text-muted-foreground hover:border-primary/30 hover:text-terminal-foreground",
      )}
    >
      {label}
    </button>
  );
}
