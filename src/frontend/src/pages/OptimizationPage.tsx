import { AgentKind, PatchStatus } from "@/backend";
import { AgentVersionPanel } from "@/components/AgentVersionPanel";
import { PatchCard } from "@/components/PatchCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUserRole } from "@/hooks/useBackend";
import {
  useAgentVersion,
  useApprovePatch,
  useEntropyState,
  useRejectPatch,
  useRollbackAgent,
  useRunCritic,
  useSuperSuitPatches,
} from "@/hooks/useOptimization";
import { backendErrorMessage } from "@/lib/backendClient";
import { agentLabel, formatRelative, formatTimestamp } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const AGENTS: AgentKind[] = [
  AgentKind.writer,
  AgentKind.visual,
  AgentKind.continuity,
];

function EntropyMeter() {
  const { data, isLoading } = useEntropyState();

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 text-muted-foreground"
        data-ocid="optimization.entropy.loading_state"
      >
        <Loader2 className="size-4 animate-spin" />
        <span className="font-mono text-[10px] uppercase tracking-wider">
          Reading entropy state
        </span>
      </div>
    );
  }

  const recent = data?.recentUpdateTimestamps ?? [];
  const max = data ? Number(data.maxUpdatesPerHour) : 3;
  const used = recent.length;
  const atCeiling = used >= max;
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3" data-ocid="optimization.entropy.panel">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Entropy ceiling
        </span>
        <span
          className={cn(
            "font-mono text-xs font-medium",
            atCeiling ? "text-status-halted" : "text-foreground",
          )}
        >
          {used} / {max} updates this hour
        </span>
      </div>

      <Progress
        value={pct}
        aria-label="Entropy updates used this hour"
        className={cn(
          "h-1.5",
          atCeiling && "[&>[data-slot=progress-indicator]]:bg-status-halted",
        )}
      />

      {atCeiling ? (
        <p
          className="flex items-start gap-2 rounded-md border border-status-halted/40 bg-status-halted/10 px-3 py-2 text-xs text-status-halted"
          data-ocid="optimization.entropy.error_state"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Entropy ceiling reached. New Super Suit updates are blocked until
            the hourly window clears.
          </span>
        </p>
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {max - used} update{max - used === 1 ? "" : "s"} remaining before the
          ceiling blocks new patches.
        </p>
      )}

      {recent.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {recent.map((ts) => (
            <li
              key={ts.toString()}
              className="rounded-sm border border-border bg-secondary/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              title={formatTimestamp(ts)}
            >
              {formatRelative(ts)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CriticControl() {
  const runCritic = useRunCritic();
  const [result, setResult] = useState<string | null>(null);

  const handleRun = () => {
    setResult(null);
    runCritic.mutate(undefined, {
      onSuccess: (patch) => {
        setResult(
          patch
            ? `Drafted ${patch.versionTag} for the ${agentLabel(patch.targetAgent)} agent.`
            : "Critic routine completed with no new patch.",
        );
      },
      onError: (error) => {
        setResult(backendErrorMessage(error));
      },
    });
  };

  return (
    <div className="flex flex-col gap-3" data-ocid="optimization.critic.panel">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold tracking-tight text-foreground">
            Critic routine
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Drafts a new Super Suit patch from historical run performance.
          </p>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="w-fit rounded-md"
        disabled={runCritic.isPending}
        onClick={handleRun}
        data-ocid="optimization.run_critic_button"
      >
        {runCritic.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        Run Critic routine
      </Button>

      {result ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            runCritic.isError
              ? "border-status-halted/40 bg-status-halted/10 text-status-halted"
              : "border-status-approved/40 bg-status-approved/10 text-status-approved",
          )}
          data-ocid={
            runCritic.isError
              ? "optimization.critic.error_state"
              : "optimization.critic.success_state"
          }
        >
          {runCritic.isError ? (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{result}</span>
        </p>
      ) : null}
    </div>
  );
}

export default function OptimizationPage() {
  const { isAdmin, isLoading } = useUserRole();
  const patchesQuery = useSuperSuitPatches();
  const approve = useApprovePatch();
  const reject = useRejectPatch();
  const rollback = useRollbackAgent();

  const writerVersion = useAgentVersion(AgentKind.writer);
  const visualVersion = useAgentVersion(AgentKind.visual);
  const continuityVersion = useAgentVersion(AgentKind.continuity);

  const versionByAgent = {
    [AgentKind.writer]: writerVersion,
    [AgentKind.visual]: visualVersion,
    [AgentKind.continuity]: continuityVersion,
  };

  const [actionMessage, setActionMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        data-ocid="optimization.loading_state"
      >
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center"
        data-ocid="optimization.error_state"
      >
        <span className="mb-4 flex size-12 items-center justify-center rounded-md border border-status-halted/40 bg-status-halted/10 text-status-halted">
          <ShieldAlert className="size-6" />
        </span>
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Access restricted
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The Optimization Gate is limited to administrators. Your current role
          does not permit reviewing or approving Super Suit patches.
        </p>
        <Button
          asChild
          variant="outline"
          className="mt-6 rounded-md"
          data-ocid="optimization.secondary_button"
        >
          <Link to="/">Return to Live Production Feed</Link>
        </Button>
      </div>
    );
  }

  const patches = patchesQuery.data ?? [];
  const pending = patches.filter(
    (patch) => patch.status === PatchStatus.pending_approval,
  );
  const decided = patches.filter(
    (patch) => patch.status !== PatchStatus.pending_approval,
  );

  const handleApprove = (id: bigint) => {
    setActionMessage(null);
    approve.mutate(id, {
      onSuccess: (patch) =>
        setActionMessage({
          tone: "success",
          text: patch
            ? `Approved ${patch.versionTag} for the ${agentLabel(patch.targetAgent)} agent.`
            : "Patch approved.",
        }),
      onError: (error) =>
        setActionMessage({ tone: "error", text: backendErrorMessage(error) }),
    });
  };

  const handleReject = (id: bigint) => {
    setActionMessage(null);
    reject.mutate(id, {
      onSuccess: (patch) =>
        setActionMessage({
          tone: "success",
          text: patch
            ? `Rejected ${patch.versionTag} for the ${agentLabel(patch.targetAgent)} agent.`
            : "Patch rejected.",
        }),
      onError: (error) =>
        setActionMessage({ tone: "error", text: backendErrorMessage(error) }),
    });
  };

  const handleRollback = (agent: AgentKind) => {
    setActionMessage(null);
    rollback.mutate(agent, {
      onSuccess: (version) =>
        setActionMessage({
          tone: "success",
          text: version
            ? `Rolled ${agentLabel(agent)} back to ${version.currentVersion}.`
            : `No prior version available for ${agentLabel(agent)}.`,
        }),
      onError: (error) =>
        setActionMessage({ tone: "error", text: backendErrorMessage(error) }),
    });
  };

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="optimization.page"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Optimization Gate
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review, approve, or reject proposed Super Suit prompt patches.
            </p>
          </div>
        </div>
        <StatusBadge
          label={`${pending.length} pending`}
          tone={pending.length > 0 ? "pending" : "approved"}
          pulse={pending.length > 0}
        />
      </header>

      {actionMessage ? (
        <p
          className={cn(
            "mb-5 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            actionMessage.tone === "error"
              ? "border-status-halted/40 bg-status-halted/10 text-status-halted"
              : "border-status-approved/40 bg-status-approved/10 text-status-approved",
          )}
          data-ocid={
            actionMessage.tone === "error"
              ? "optimization.action.error_state"
              : "optimization.action.success_state"
          }
        >
          {actionMessage.tone === "error" ? (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Pending review
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">
              {pending.length} patch{pending.length === 1 ? "" : "es"}
            </span>
          </div>

          {patchesQuery.isLoading ? (
            <div
              className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-card/50"
              data-ocid="optimization.patches.loading_state"
            >
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : patchesQuery.isError ? (
            <div
              className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-status-halted/40 bg-status-halted/5 px-4 text-center"
              data-ocid="optimization.patches.error_state"
            >
              <AlertTriangle className="size-5 text-status-halted" />
              <p className="text-sm text-muted-foreground">
                {backendErrorMessage(patchesQuery.error)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-md"
                onClick={() => void patchesQuery.refetch()}
                data-ocid="optimization.patches.retry_button"
              >
                Retry
              </Button>
            </div>
          ) : pending.length === 0 ? (
            <div
              className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 text-center"
              data-ocid="optimization.patches.empty_state"
            >
              <CheckCircle2 className="size-6 text-status-approved" />
              <p className="font-display text-sm font-semibold text-foreground">
                No patches awaiting review
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Run the Critic routine to draft a new Super Suit patch from
                historical run performance.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((patch, index) => (
                <PatchCard
                  key={patch.id.toString()}
                  patch={patch}
                  index={index}
                  isApproving={
                    approve.isPending && approve.variables === patch.id
                  }
                  isRejecting={
                    reject.isPending && reject.variables === patch.id
                  }
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}

          {decided.length > 0 ? (
            <div className="mt-2 flex flex-col gap-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Decision history
              </h2>
              {decided.map((patch, index) => (
                <PatchCard
                  key={patch.id.toString()}
                  patch={patch}
                  index={pending.length + index}
                  isApproving={false}
                  isRejecting={false}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          ) : null}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-panel">
            <EntropyMeter />
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-panel">
            <CriticControl />
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Agent versions
            </h2>
            {AGENTS.map((agent) => {
              const query = versionByAgent[agent];
              return (
                <AgentVersionPanel
                  key={agent}
                  agent={agent}
                  version={query.data}
                  isLoading={query.isLoading}
                  isRollingBack={
                    rollback.isPending && rollback.variables === agent
                  }
                  onRollback={handleRollback}
                />
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
