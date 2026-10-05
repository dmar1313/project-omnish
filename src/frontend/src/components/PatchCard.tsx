import type { SuperSuitPatch } from "@/backend";
import { PatchStatus } from "@/backend";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  agentLabel,
  formatRelative,
  formatTimestamp,
  patchStatusMeta,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { Check, GitBranch, Loader2, X } from "lucide-react";

export interface PatchCardProps {
  patch: SuperSuitPatch;
  index: number;
  isApproving: boolean;
  isRejecting: boolean;
  onApprove: (id: bigint) => void;
  onReject: (id: bigint) => void;
}

/**
 * A single pending/decided Super Suit patch: target agent, proposed prompt
 * patch, performance delta, version tag, timestamp, and the review actions.
 */
export function PatchCard({
  patch,
  index,
  isApproving,
  isRejecting,
  onApprove,
  onReject,
}: PatchCardProps) {
  const meta = patchStatusMeta(patch.status);
  const isPending = patch.status === PatchStatus.pending_approval;
  const busy = isApproving || isRejecting;

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-panel transition-colors",
        isPending ? "border-status-pending/40" : "border-border",
      )}
      data-ocid={`optimization.patch.item.${index + 1}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
            <GitBranch className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold tracking-tight text-foreground">
              {agentLabel(patch.targetAgent)} Agent
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {patch.versionTag}
            </p>
          </div>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} pulse={isPending} />
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Performance delta
          </p>
          <p className="font-mono text-xs text-foreground">
            {patch.performanceDeltaMetrics || "—"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Drafted
          </p>
          <p
            className="font-mono text-xs text-foreground"
            title={formatTimestamp(patch.createdAt)}
          >
            {formatRelative(patch.createdAt)}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Proposed prompt patch
        </p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-terminal-border bg-terminal p-3 font-mono text-xs leading-relaxed text-terminal-foreground shadow-inset-terminal">
          {patch.proposedPromptPatch || "No patch text supplied."}
        </pre>
      </div>

      {isPending ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            type="button"
            size="sm"
            className="rounded-md"
            disabled={busy}
            onClick={() => onApprove(patch.id)}
            data-ocid={`optimization.approve_button.${index + 1}`}
          >
            {isApproving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve patch
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-md border-status-rejected/40 text-status-rejected hover:bg-status-rejected/10 hover:text-status-rejected"
            disabled={busy}
            onClick={() => onReject(patch.id)}
            data-ocid={`optimization.reject_button.${index + 1}`}
          >
            {isRejecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
            Reject patch
          </Button>
        </footer>
      ) : null}
    </article>
  );
}
