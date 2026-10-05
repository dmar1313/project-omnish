import type {
  AgentOutput,
  AssetIngredient,
  FormatAdapterOutput,
  ProductionRun,
  Revision,
  RunDecisionState,
  SimulationLog,
} from "@/backend";
import { AgentKind, RunDecision, RunStatus } from "@/backend";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  agentLabel,
  assetKindLabel,
  formatNumber,
  formatTimestamp,
  isActiveRun,
  isDecidedDecision,
  runDecisionMeta,
  runStatusMeta,
  simulationStepLabel,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  Clapperboard,
  FileText,
  History,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Radio,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

export interface RunDetailProps {
  run: ProductionRun;
  /** Ingredients bound to this run, resolved from the asset registry. */
  ingredients: AssetIngredient[];
  /** Every revision of the run (original + each tweak), oldest first. */
  revisions?: Revision[];
  /** The run's decision state, or null while it is still in progress. */
  decision?: RunDecisionState | null;
  /** The revision currently displayed; defaults to the latest. */
  selectedRevision?: bigint | null;
  onSelectRevision?: (revisionNumber: bigint) => void;
  /** Submits a natural-language tweak instruction. */
  onSubmitTweak?: (instruction: string) => void;
  isTweaking?: boolean;
  tweakError?: string | null;
  /** Proceed controls. */
  onAccept?: () => void;
  onReject?: (reason: string | null) => void;
  onContinue?: () => void;
  isDeciding?: boolean;
  decisionError?: string | null;
  /** Advances an approved run to the next pipeline stage. */
  onAdvanceStage?: () => void;
  /** Returns the operator to the Live Production Feed. */
  onReturnToFeed?: () => void;
  /** Opens the run's generated videos view. */
  onViewVideos?: () => void;
  /** Returns to the feed with the run's prompt prefilled for revision. */
  onRevisePrompt?: (prompt: string) => void;
  /** Starts a fresh run from the feed. */
  onStartNewRun?: () => void;
  /** Pipeline logs, used to show live progress for an active run. */
  logs?: SimulationLog[];
  /**
   * The produced-video surface, injected by the page so this component stays
   * provider-free. Rendered alongside the agent text outputs.
   */
  mediaSlot?: React.ReactNode;
  className?: string;
}

const AGENT_ORDER: AgentKind[] = [
  AgentKind.writer,
  AgentKind.visual,
  AgentKind.continuity,
];

const AGENT_ICON: Record<AgentKind, typeof FileText> = {
  [AgentKind.writer]: FileText,
  [AgentKind.visual]: ImageIcon,
  [AgentKind.continuity]: ShieldAlert,
};

/**
 * Full reasoning trail for a single production run: the displayed revision's
 * agent outputs, bound ingredients, adapted platform formats, any blocking
 * violation, plus the revision history, tweak composer, and proceed controls.
 */
export function RunDetail({
  run,
  ingredients,
  revisions = [],
  decision = null,
  selectedRevision = null,
  onSelectRevision,
  onSubmitTweak,
  isTweaking = false,
  tweakError = null,
  onAccept,
  onReject,
  onContinue,
  isDeciding = false,
  decisionError = null,
  onAdvanceStage,
  onReturnToFeed,
  onViewVideos,
  onRevisePrompt,
  onStartNewRun,
  logs = [],
  mediaSlot,
  className,
}: RunDetailProps) {
  const [instruction, setInstruction] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const status = runStatusMeta(run.status);
  const isRejected = decision?.decision === RunDecision.rejected;
  // A manual rejection also sets the run status to #halted, but it is not a
  // pipeline halt — only show the blocking-violation card for a genuine halt.
  const isHalted =
    (run.status === RunStatus.halted || run.status === RunStatus.failed) &&
    !isRejected;
  const isCompleted = run.status === RunStatus.completed;
  const isActive = isActiveRun(run.status);

  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

  const sortedRevisions = [...revisions].sort((a, b) =>
    a.revisionNumber < b.revisionNumber
      ? -1
      : a.revisionNumber > b.revisionNumber
        ? 1
        : 0,
  );
  const latestRevision = sortedRevisions[sortedRevisions.length - 1] ?? null;
  const displayedRevision =
    sortedRevisions.find((rev) => rev.revisionNumber === selectedRevision) ??
    latestRevision;

  const generatedAssets = displayedRevision
    ? displayedRevision.generatedAssets
    : run.generatedAssets;
  const formatOutputs = displayedRevision
    ? displayedRevision.formatOutputs
    : run.formatOutputs;
  const tokenCostBurn = displayedRevision
    ? displayedRevision.tokenCostBurn
    : run.tokenCostBurn;

  const outputsByAgent = new Map<AgentKind, AgentOutput>();
  for (const output of generatedAssets) {
    outputsByAgent.set(output.agent, output);
  }

  const decisionMeta = decision ? runDecisionMeta(decision.decision) : null;
  // Only an explicit approve/reject retires the proceed controls. A freshly
  // completed run is seeded with a #completed decision, which must still show
  // the tweak input and Accept/Reject/Continue controls.
  const isDecided = isDecidedDecision(decision?.decision);
  const controlsDisabled = isTweaking || isDeciding;
  const canTweak = isCompleted && !isDecided && onSubmitTweak !== undefined;
  const canProceed =
    isCompleted &&
    !isDecided &&
    (onAccept !== undefined ||
      onReject !== undefined ||
      onContinue !== undefined);

  const handleTweakSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = instruction.trim();
    if (trimmed.length === 0 || isTweaking || !onSubmitTweak) return;
    onSubmitTweak(trimmed);
    setInstruction("");
  };

  const handleRejectSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDeciding || !onReject) return;
    const trimmed = rejectReason.trim();
    onReject(trimmed.length > 0 ? trimmed : null);
    setRejectReason("");
    setShowReject(false);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <section
        className="rounded-lg border border-border bg-card p-4 shadow-panel"
        data-ocid="simulation.run_detail.card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Run #{String(run.id)}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
              Reasoning Trail
            </h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {formatTimestamp(run.timestamp)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge
                label={status.label}
                tone={status.tone}
                pulse={run.status === RunStatus.running}
              />
              {decisionMeta ? (
                <StatusBadge
                  label={decisionMeta.label}
                  tone={decisionMeta.tone}
                  data-ocid="simulation.decision.badge"
                />
              ) : null}
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatNumber(tokenCostBurn, 0)} tokens
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Source Input
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {run.rawInput}
          </p>
        </div>

        {decision?.decision === RunDecision.rejected &&
        decision.rejectionReason ? (
          <div
            className="mt-3 flex items-start gap-2 rounded-md border border-status-rejected/40 bg-status-rejected/10 p-3"
            data-ocid="simulation.decision.reason"
          >
            <X
              className="mt-0.5 size-4 shrink-0 text-status-rejected"
              aria-hidden="true"
            />
            <p className="text-sm text-foreground">
              <span className="font-medium">Rejected:</span>{" "}
              {decision.rejectionReason}
            </p>
          </div>
        ) : null}
      </section>

      {isHalted ? (
        <section
          className="flex items-start gap-3 rounded-lg border border-status-halted/40 bg-status-halted/10 p-4"
          data-ocid="simulation.halt_reason.card"
        >
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-status-halted"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold tracking-tight text-status-halted">
              Run halted — blocking violation
            </h3>
            <p className="mt-1 text-sm text-foreground">
              The pipeline stopped before completion. The blocking lore or
              identity violation is recorded in the evaluation stream below.
            </p>
          </div>
        </section>
      ) : null}

      {isHalted ? (
        <section
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="simulation.recovery.section"
        >
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Recover this run
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Revise the prompt and try again, or start a fresh run from the
              feed.
            </p>
          </div>
          {onRevisePrompt ? (
            <Button
              type="button"
              size="sm"
              className="gap-2 rounded-md"
              onClick={() => onRevisePrompt(run.rawInput)}
              data-ocid="simulation.revise_prompt_button"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Revise prompt
            </Button>
          ) : null}
          {onStartNewRun ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 rounded-md"
              onClick={onStartNewRun}
              data-ocid="simulation.start_new_run_button"
            >
              Start new run
            </Button>
          ) : null}
        </section>
      ) : null}

      {isActive ? (
        <section
          className="rounded-lg border border-status-running/40 bg-status-running/10 p-4 shadow-panel"
          data-ocid="simulation.live_progress.section"
        >
          <header className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-status-running animate-live-blink"
            />
            <h3 className="font-display text-sm font-semibold tracking-tight text-status-running">
              Pipeline running
            </h3>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {logs.length} stage{logs.length === 1 ? "" : "s"} logged
            </span>
          </header>
          <p className="mt-2 text-sm text-foreground">
            {latestLog
              ? `Current stage: ${simulationStepLabel(latestLog.stepName)}`
              : "Initializing the evaluation pipeline…"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Results appear here automatically as soon as the run completes — no
            refresh needed.
          </p>
        </section>
      ) : null}

      {sortedRevisions.length > 0 ? (
        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="simulation.revisions.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Revision History
            </h3>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
              {sortedRevisions.length}
            </span>
          </header>
          <ul className="flex flex-col gap-2">
            {sortedRevisions.map((revision) => {
              const isSelected =
                displayedRevision?.revisionNumber === revision.revisionNumber;
              const isOriginal = revision.revisionNumber === 1n;
              return (
                <li key={String(revision.revisionNumber)}>
                  <button
                    type="button"
                    onClick={() => onSelectRevision?.(revision.revisionNumber)}
                    aria-current={isSelected ? "true" : undefined}
                    data-ocid="simulation.revisions.item"
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-background/50 hover:border-primary/30 hover:bg-secondary",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        v{String(revision.revisionNumber)}
                      </span>
                      <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {isOriginal ? "Original" : "Tweak"}
                      </span>
                      {isSelected ? (
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-primary">
                          Viewing
                        </span>
                      ) : null}
                    </div>
                    {revision.instruction ? (
                      <p className="mt-1 break-words text-xs text-foreground">
                        {revision.instruction}
                      </p>
                    ) : (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Original generation — no tweak instruction.
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {formatTimestamp(revision.timestamp)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section
        className="rounded-lg border border-border bg-card p-4 shadow-panel"
        data-ocid="simulation.agent_outputs.section"
      >
        <header className="mb-3 flex items-center gap-2">
          <Radio className="size-4 text-primary" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
            Agent Outputs
          </h3>
          {displayedRevision ? (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              v{String(displayedRevision.revisionNumber)}
            </span>
          ) : null}
        </header>
        <div className="grid gap-3 md:grid-cols-3">
          {AGENT_ORDER.map((agent) => {
            const output = outputsByAgent.get(agent);
            const Icon = AGENT_ICON[agent];
            return (
              <article
                key={agent}
                className="flex flex-col rounded-md border border-border bg-background/60 p-3"
                data-ocid={`simulation.agent_output.${agent}.card`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {agentLabel(agent)}
                  </span>
                </div>
                {output ? (
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                    {output.content}
                  </p>
                ) : (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    No output recorded.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {mediaSlot}

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="simulation.ingredients.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <Boxes className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Bound Ingredients
            </h3>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
              {ingredients.length}
            </span>
          </header>
          {ingredients.length === 0 ? (
            <p
              className="py-4 text-center font-mono text-[11px] text-muted-foreground"
              data-ocid="simulation.ingredients.empty_state"
            >
              No ingredients bound to this run.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ingredients.map((ingredient) => (
                <li
                  key={String(ingredient.id)}
                  className="flex items-center gap-3 rounded-md border border-border bg-background/60 p-2.5"
                  data-ocid="simulation.ingredients.item"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground">
                    <Layers className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {ingredient.fileName}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {assetKindLabel(ingredient.fileType)}
                      {ingredient.linkedCharacterId !== undefined
                        ? ` · char #${String(ingredient.linkedCharacterId)}`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="simulation.formats.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <Link2 className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Adapted Platform Formats
            </h3>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatOutputs.length}
            </span>
          </header>
          {formatOutputs.length === 0 ? (
            <p
              className="py-4 text-center font-mono text-[11px] text-muted-foreground"
              data-ocid="simulation.formats.empty_state"
            >
              No platform adaptations produced.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {formatOutputs.map((format, index) => (
                <FormatRow
                  key={`${format.platform}-${index}`}
                  format={format}
                  index={index}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {canTweak ? (
        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="simulation.tweak.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Suggest tweaks
            </h3>
          </header>
          <form onSubmit={handleTweakSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="tweak-instruction"
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Change request
              </Label>
              <Textarea
                id="tweak-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                disabled={controlsDisabled}
                placeholder="e.g. make the ending warmer, shorten the caption, keep the visual but change the tone"
                className="min-h-20 resize-y"
                data-ocid="simulation.tweak.input"
              />
            </div>
            {tweakError ? (
              <p
                className="flex items-center gap-2 text-sm text-status-halted"
                role="alert"
                data-ocid="simulation.tweak.error_state"
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {tweakError}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {isTweaking ? (
                <span
                  className="mr-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-primary"
                  data-ocid="simulation.tweak.loading_state"
                >
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Regenerating script…
                </span>
              ) : null}
              <Button
                type="submit"
                size="sm"
                className="gap-2 rounded-md"
                disabled={controlsDisabled || instruction.trim().length === 0}
                data-ocid="simulation.tweak.submit_button"
              >
                {isTweaking ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden="true" />
                )}
                Generate revision
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {canProceed ? (
        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="simulation.proceed.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <Check className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Proceed
            </h3>
            {displayedRevision ? (
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Acting on v{String(displayedRevision.revisionNumber)}
              </span>
            ) : null}
          </header>

          <div className="flex flex-col gap-3">
            {decisionError ? (
              <p
                className="flex items-center gap-2 text-sm text-status-halted"
                role="alert"
                data-ocid="simulation.proceed.error_state"
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {decisionError}
              </p>
            ) : null}

            {showReject ? (
              <form
                onSubmit={handleRejectSubmit}
                className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3"
              >
                <Label
                  htmlFor="reject-reason"
                  className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  Rejection reason (optional)
                </Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  disabled={controlsDisabled}
                  placeholder="Why is this run being rejected?"
                  className="min-h-16 resize-y"
                  data-ocid="simulation.reject.input"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-md"
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason("");
                    }}
                    disabled={controlsDisabled}
                    data-ocid="simulation.reject.cancel_button"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    className="gap-2 rounded-md"
                    disabled={controlsDisabled}
                    data-ocid="simulation.reject.confirm_button"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    Confirm reject
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {onAccept ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 rounded-md"
                    onClick={onAccept}
                    disabled={controlsDisabled || displayedRevision === null}
                    data-ocid="simulation.accept_button"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    Accept
                  </Button>
                ) : null}
                {onContinue ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-md"
                    onClick={onContinue}
                    disabled={controlsDisabled || displayedRevision === null}
                    data-ocid="simulation.continue_button"
                  >
                    <Radio className="size-3.5" aria-hidden="true" />
                    Continue
                  </Button>
                ) : null}
                {onReject ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-2 rounded-md"
                    onClick={() => setShowReject(true)}
                    disabled={controlsDisabled}
                    data-ocid="simulation.reject_button"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    Reject
                  </Button>
                ) : null}
                {onViewVideos ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto gap-2 rounded-md"
                    onClick={onViewVideos}
                    disabled={controlsDisabled}
                    data-ocid="simulation.view_videos_button"
                  >
                    <Clapperboard className="size-3.5" aria-hidden="true" />
                    View generated videos
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {isDecided ? (
        <section
          className={cn(
            "rounded-lg border p-4 shadow-panel",
            decision?.decision === RunDecision.rejected
              ? "border-status-rejected/40 bg-status-rejected/10"
              : "border-status-approved/40 bg-status-approved/10",
          )}
          data-ocid="simulation.outcome.section"
        >
          <div
            className="flex flex-col gap-3"
            data-ocid="simulation.proceed.decided_state"
          >
            <div className="flex items-start gap-3">
              {decision?.decision === RunDecision.rejected ? (
                <X
                  className="mt-0.5 size-5 shrink-0 text-status-rejected"
                  aria-hidden="true"
                />
              ) : (
                <Check
                  className="mt-0.5 size-5 shrink-0 text-status-approved"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <h3
                  className={cn(
                    "font-display text-sm font-semibold tracking-tight",
                    decision?.decision === RunDecision.rejected
                      ? "text-status-rejected"
                      : "text-status-approved",
                  )}
                >
                  {decision?.decision === RunDecision.rejected
                    ? "Run rejected"
                    : "Run approved"}
                </h3>
                <p className="mt-1 text-sm text-foreground">
                  {decision?.decision === RunDecision.rejected
                    ? "This run was rejected"
                    : "This run was approved"}
                  {decision?.acceptedRevision !== undefined
                    ? ` at v${String(decision.acceptedRevision)}`
                    : ""}
                  .{" "}
                  {decision?.decision === RunDecision.rejected
                    ? "Return to the feed to revise the prompt or start a new run."
                    : "Choose where to go next."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {decision?.decision === RunDecision.approved && onAdvanceStage ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 rounded-md"
                  onClick={onAdvanceStage}
                  data-ocid="simulation.advance_stage_button"
                >
                  Continue to next stage
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
              {onReturnToFeed ? (
                <Button
                  type="button"
                  variant={
                    decision?.decision === RunDecision.rejected
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  className="gap-2 rounded-md"
                  onClick={onReturnToFeed}
                  data-ocid="simulation.return_to_feed_button"
                >
                  <Radio className="size-3.5" aria-hidden="true" />
                  Return to Live Production Feed
                </Button>
              ) : null}
              {onViewVideos ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-md"
                  onClick={onViewVideos}
                  data-ocid="simulation.view_videos_button"
                >
                  <Clapperboard className="size-3.5" aria-hidden="true" />
                  View generated videos
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FormatRow({
  format,
  index,
}: {
  format: FormatAdapterOutput;
  index: number;
}) {
  return (
    <li
      className="rounded-md border border-border bg-background/60 p-2.5"
      data-ocid={`simulation.formats.item.${index + 1}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">
          {format.platform}
        </span>
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {format.aspectRatio}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {String(format.characterLimit)} chars
        </span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
        {format.content}
      </p>
    </li>
  );
}
