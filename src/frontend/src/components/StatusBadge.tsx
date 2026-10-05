import type { StatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<StatusTone, string> = {
  queued: "border-status-queued/40 bg-status-queued/10 text-status-queued",
  running: "border-status-running/50 bg-status-running/10 text-status-running",
  completed:
    "border-status-completed/40 bg-status-completed/10 text-status-completed",
  halted: "border-status-halted/40 bg-status-halted/10 text-status-halted",
  pending: "border-status-pending/40 bg-status-pending/10 text-status-pending",
  approved:
    "border-status-approved/40 bg-status-approved/10 text-status-approved",
  rejected:
    "border-status-rejected/40 bg-status-rejected/10 text-status-rejected",
};

const DOT_CLASS: Record<StatusTone, string> = {
  queued: "bg-status-queued",
  running: "bg-status-running",
  completed: "bg-status-completed",
  halted: "bg-status-halted",
  pending: "bg-status-pending",
  approved: "bg-status-approved",
  rejected: "bg-status-rejected",
};

export interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  /** Show a pulsing dot for live states. */
  pulse?: boolean;
  className?: string;
}

/**
 * Shared status pill driven by the design system's `--status-*` tokens.
 * Used across runs, patches, lore, and telemetry surfaces.
 */
export function StatusBadge({
  label,
  tone,
  pulse = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          DOT_CLASS[tone],
          pulse && "animate-status-pulse",
        )}
      />
      {label}
    </span>
  );
}
