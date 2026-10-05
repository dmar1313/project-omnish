import type { AgentKind, AgentVersion } from "@/backend";
import { Button } from "@/components/ui/button";
import { agentLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { History, Loader2, RotateCcw } from "lucide-react";

export interface AgentVersionPanelProps {
  agent: AgentKind;
  version: AgentVersion | null | undefined;
  isLoading: boolean;
  isRollingBack: boolean;
  onRollback: (agent: AgentKind) => void;
}

/**
 * Current version and version history for one agent, with a one-click
 * rollback to the most recent prior approved version.
 */
export function AgentVersionPanel({
  agent,
  version,
  isLoading,
  isRollingBack,
  onRollback,
}: AgentVersionPanelProps) {
  const history = version?.history ?? [];
  const current = version?.currentVersion;
  const canRollback = history.length > 1;

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-panel"
      data-ocid={`optimization.agent.panel.${agent}`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
            {agentLabel(agent)}
          </h3>
        </div>
        <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
          {current ?? "—"}
        </span>
      </header>

      {isLoading ? (
        <div
          className="flex items-center gap-2 py-2 text-muted-foreground"
          data-ocid={`optimization.agent.loading_state.${agent}`}
        >
          <Loader2 className="size-4 animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-wider">
            Loading history
          </span>
        </div>
      ) : history.length === 0 ? (
        <p
          className="py-2 font-mono text-[11px] text-muted-foreground"
          data-ocid={`optimization.agent.empty_state.${agent}`}
        >
          No version history recorded.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {history.map((tag, index) => {
            const isCurrent = tag === current;
            return (
              <li
                key={tag}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
                  isCurrent
                    ? "border-status-approved/40 bg-status-approved/10"
                    : "border-border bg-secondary/40",
                )}
                data-ocid={`optimization.agent.version.${agent}.${index + 1}`}
              >
                <span className="min-w-0 truncate font-mono text-xs text-foreground">
                  {tag}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isCurrent ? "Current" : "Prior"}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <footer className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {history.length} version{history.length === 1 ? "" : "s"} on record
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-md"
          disabled={!canRollback || isRollingBack}
          onClick={() => onRollback(agent)}
          data-ocid={`optimization.rollback_button.${agent}`}
        >
          {isRollingBack ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          Roll back
        </Button>
      </footer>
    </section>
  );
}
