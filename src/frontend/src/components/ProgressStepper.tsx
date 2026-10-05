import type { FlowStage } from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  Check,
  Clapperboard,
  FileText,
  FlaskConical,
  Sparkles,
} from "lucide-react";

export type { FlowStage };

export interface FlowStageMeta {
  id: FlowStage;
  label: string;
  hint: string;
  icon: typeof FileText;
}

export const FLOW_STAGES: FlowStageMeta[] = [
  {
    id: "prompt",
    label: "Prompt",
    hint: "Compose the raw idea",
    icon: FileText,
  },
  {
    id: "simulation",
    label: "Simulation",
    hint: "Five-stage evaluation",
    icon: FlaskConical,
  },
  {
    id: "review",
    label: "Review",
    hint: "Tweak, accept, or reject",
    icon: Sparkles,
  },
  {
    id: "videos",
    label: "Generated Videos",
    hint: "Finished outputs",
    icon: Clapperboard,
  },
];

export interface ProgressStepperProps {
  /** The stage the run is currently at. */
  currentStage: FlowStage;
  /** Stages the operator can jump back to. */
  reachedStages: FlowStage[];
  /** Jump to a reached stage. */
  onNavigate: (stage: FlowStage) => void;
  className?: string;
}

/**
 * Persistent pipeline stepper: Prompt → Simulation → Review → Generated Videos.
 * Highlights the current stage and lets the operator jump to any stage already
 * reached. Horizontal on desktop, compact scrollable rail on mobile.
 */
export function ProgressStepper({
  currentStage,
  reachedStages,
  onNavigate,
  className,
}: ProgressStepperProps) {
  const currentIndex = FLOW_STAGES.findIndex((s) => s.id === currentStage);

  return (
    <nav
      aria-label="Production pipeline"
      className={cn(
        "rounded-lg border border-border bg-card p-2 shadow-panel",
        className,
      )}
      data-ocid="flow.stepper"
    >
      <ol className="flex items-stretch gap-1 overflow-x-auto">
        {FLOW_STAGES.map((stage, index) => {
          const reached = reachedStages.includes(stage.id);
          const isCurrent = stage.id === currentStage;
          const isComplete = reached && index < currentIndex;
          const Icon = stage.icon;
          const interactive = reached && !isCurrent;
          return (
            <li key={stage.id} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                onClick={() => interactive && onNavigate(stage.id)}
                disabled={!interactive}
                aria-current={isCurrent ? "step" : undefined}
                data-ocid={`flow.stepper.${stage.id}.tab`}
                className={cn(
                  "group flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                  isCurrent
                    ? "border-primary/50 bg-primary/10"
                    : reached
                      ? "border-border bg-background/50 hover:border-primary/30 hover:bg-secondary"
                      : "cursor-not-allowed border-transparent bg-transparent opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]",
                    isCurrent
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : isComplete
                        ? "border-status-completed/40 bg-status-completed/10 text-status-completed"
                        : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <Icon className="size-3" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate font-mono text-[10px] uppercase tracking-wider",
                      isCurrent
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {stage.label}
                  </span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                    {stage.hint}
                  </span>
                </span>
              </button>
              {index < FLOW_STAGES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-0.5 hidden h-px w-4 shrink-0 sm:block",
                    index < currentIndex ? "bg-primary/40" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
