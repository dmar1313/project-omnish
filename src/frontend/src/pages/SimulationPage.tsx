import type {
  CameoCapture,
  DnaRecord,
  MediaArtifact,
  ProductionRun,
  Revision,
  RunDecisionState,
  RunSummary,
  SimulationLog,
  VideoGeneration,
} from "@/backend";
import { RunDecision, RunStatus, VideoGenerationStatus } from "@/backend";
import { GenerateVideosControl } from "@/components/GenerateVideosControl";
import { LogStream } from "@/components/LogStream";
import { ProgressStepper } from "@/components/ProgressStepper";
import { RunDetail } from "@/components/RunDetail";
import { StatusBadge } from "@/components/StatusBadge";
import { VideoArtifactPanel } from "@/components/VideoArtifactPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackend } from "@/hooks/useBackend";
import { formatElapsed, useElapsedTime } from "@/hooks/useElapsedTime";
import { usePolling } from "@/hooks/usePolling";
import {
  usePollVideoGeneration,
  useVideoGeneration,
  useVideoModels,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import {
  formatRelative,
  isActiveRun,
  isDecidedDecision,
  isVideoGenerating,
  reachedFlowStages,
  runDecisionMeta,
  runFlowStage,
  runStatusMeta,
} from "@/lib/status";
import type { FlowStage } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertCircle,
  FlaskConical,
  Loader2,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 2500;

function parseRunId(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

export default function SimulationPage() {
  const { actor, isReady } = useBackend();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const selectedRunId = parseRunId(search.runId);

  // The displayed revision is keyed by run so switching runs resets it without
  // an effect; null means "follow the latest revision".
  const [revisionSelection, setRevisionSelection] = useState<{
    runId: string;
    revisionNumber: bigint | null;
  } | null>(null);
  const [tweakErrorState, setTweakErrorState] = useState<{
    runId: string;
    message: string;
  } | null>(null);
  const [decisionErrorState, setDecisionErrorState] = useState<{
    runId: string;
    message: string;
  } | null>(null);

  const runsQuery = useQuery<RunSummary[]>({
    queryKey: ["runs"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRuns();
    },
    enabled: isReady,
  });

  const runs = useMemo(() => {
    const list = runsQuery.data ?? [];
    return [...list].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
    );
  }, [runsQuery.data]);

  const activeRunId = useMemo(() => {
    const active = runs.find((run) => isActiveRun(run.status));
    return active?.id ?? null;
  }, [runs]);

  const effectiveRunId = selectedRunId ?? activeRunId ?? runs[0]?.id ?? null;

  const runQuery = useQuery<ProductionRun | null>({
    queryKey: ["run", effectiveRunId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || effectiveRunId === null) return null;
      return actor.getRun(effectiveRunId);
    },
    enabled: isReady && effectiveRunId !== null,
  });

  const run = runQuery.data ?? null;
  const runIsActive = run ? isActiveRun(run.status) : false;
  // A run can be #completed while its video output is still #generating (a
  // tweak regenerates a revision without changing the run status), so the
  // generating window is tracked separately from the run's active status.
  const runIsGenerating = run
    ? isVideoGenerating(run.status, run.videoStatus)
    : false;

  // External video generation is tracked by its own record, not by the run's
  // videoStatus (the backend does not flip run.videoStatus to #generating while
  // an external provider runs). Polling this query is the only reliable way to
  // observe the generating window and its live elapsed time.
  const videoGenerationQuery = useQuery<VideoGeneration | null>({
    queryKey: ["videoGeneration", effectiveRunId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || effectiveRunId === null) return null;
      return actor.getVideoGeneration(effectiveRunId);
    },
    enabled: isReady && effectiveRunId !== null,
  });

  const videoGeneration = videoGenerationQuery.data ?? null;
  const videoIsGenerating =
    videoGeneration?.status === VideoGenerationStatus.generating;
  const videoElapsedMs = useElapsedTime(
    videoGeneration?.startedAt,
    videoIsGenerating,
  );

  // While the external generation is `#generating`, actively poll the provider
  // through the backend so a still-processing prediction settles to ready /
  // failed without a manual refresh.
  const videoPollQuery = usePollVideoGeneration(
    effectiveRunId,
    videoIsGenerating,
  );

  // Resolve the human-readable model name for the generating banner, falling
  // back to the raw model id when the catalog has not loaded.
  const videoModelsQuery = useVideoModels();
  const videoModelName = useMemo(() => {
    if (!videoGeneration) return null;
    const match = (videoModelsQuery.data ?? []).find(
      (model) => model.id === videoGeneration.modelId,
    );
    return match?.name ?? null;
  }, [videoModelsQuery.data, videoGeneration]);

  const revisionsQuery = useQuery<Revision[]>({
    queryKey: ["revisions", effectiveRunId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || effectiveRunId === null) return [];
      return actor.listRevisions(effectiveRunId);
    },
    enabled: isReady && effectiveRunId !== null,
  });

  const revisions = useMemo(() => {
    const list = revisionsQuery.data ?? [];
    return [...list].sort((a, b) =>
      a.revisionNumber < b.revisionNumber
        ? -1
        : a.revisionNumber > b.revisionNumber
          ? 1
          : 0,
    );
  }, [revisionsQuery.data]);

  // The displayed revision is keyed by run so switching runs resets it without
  // an effect; null means "follow the latest revision".
  const effectiveRunKey = effectiveRunId?.toString() ?? "none";
  const selectedRevision =
    revisionSelection && revisionSelection.runId === effectiveRunKey
      ? revisionSelection.revisionNumber
      : null;

  const setSelectedRevision = (revisionNumber: bigint | null) => {
    setRevisionSelection({ runId: effectiveRunKey, revisionNumber });
  };

  // The revision the operator is actually looking at: an explicit selection,
  // otherwise the latest revision (matching RunDetail's fallback). Accept must
  // act on this displayed revision rather than requiring a manual selection.
  const displayedRevisionNumber = useMemo(() => {
    if (selectedRevision !== null) return selectedRevision;
    const latest = revisions[revisions.length - 1];
    return latest ? latest.revisionNumber : null;
  }, [selectedRevision, revisions]);

  const decisionQuery = useQuery<RunDecisionState | null>({
    queryKey: ["runDecision", effectiveRunId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || effectiveRunId === null) return null;
      return actor.getRunDecision(effectiveRunId);
    },
    enabled: isReady && effectiveRunId !== null,
  });

  const decisionsQuery = useQuery<Array<[bigint, RunDecisionState]>>({
    queryKey: ["runDecisions"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRunDecisions();
    },
    enabled: isReady,
  });

  const decisionsByRun = useMemo(() => {
    const map = new Map<string, RunDecisionState>();
    for (const [id, state] of decisionsQuery.data ?? []) {
      map.set(id.toString(), state);
    }
    return map;
  }, [decisionsQuery.data]);

  const logsQuery = useQuery<SimulationLog[]>({
    queryKey: ["simulationLogs", effectiveRunId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || effectiveRunId === null) return [];
      return actor.listSimulationLogs(effectiveRunId);
    },
    enabled: isReady && effectiveRunId !== null,
  });

  const ingredientsQuery = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listAssets();
    },
    enabled: isReady && run !== null,
  });

  const artifactQuery = useQuery<MediaArtifact | null>({
    queryKey: ["mediaArtifact", effectiveRunId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || effectiveRunId === null) return null;
      return actor.getMediaArtifact(effectiveRunId);
    },
    enabled: isReady && effectiveRunId !== null,
  });

  // When the external generation settles from #generating to a terminal state,
  // the provider's output URL has just been attached to the run as its media
  // artifact. The run/revision/artifact queries were fetched before that write,
  // so they must be refetched once the generation is no longer in flight —
  // otherwise a ready video never appears without a manual refresh.
  const videoGenerationSettled = videoGeneration !== null && !videoIsGenerating;
  useEffect(() => {
    if (!videoGenerationSettled) return;
    void runQuery.refetch();
    void revisionsQuery.refetch();
    void artifactQuery.refetch();
  }, [videoGenerationSettled, runQuery, revisionsQuery, artifactQuery]);

  const charactersQuery = useQuery<DnaRecord[]>({
    queryKey: ["dna"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listDna();
    },
    enabled: isReady && run !== null,
  });

  const cameosQuery = useQuery<CameoCapture[]>({
    queryKey: ["cameos"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listCameos();
    },
    enabled: isReady && run !== null,
  });

  const boundIngredients = useMemo(() => {
    if (!run) return [];
    const all = ingredientsQuery.data ?? [];
    const runInput = run.rawInput;
    return all.filter((ingredient) => runInput.includes(ingredient.fileName));
  }, [run, ingredientsQuery.data]);

  // Live streaming: the runs list is polled continuously while the page is
  // ready so a run started elsewhere (e.g. the Live Feed) is discovered as soon
  // as the backend persists its #running row. The selected run, its revisions,
  // and its logs are polled while that run is active OR while its video output
  // is still generating (a tweak regenerates a revision while the run stays
  // #completed). Gating the runs poll on an already-active run would deadlock —
  // the in-flight run would never be discovered.
  usePolling(
    () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["runDecisions"] });
      if (effectiveRunId !== null) {
        void queryClient.invalidateQueries({
          queryKey: ["run", effectiveRunId.toString()],
        });
        void queryClient.invalidateQueries({
          queryKey: ["revisions", effectiveRunId.toString()],
        });
        void queryClient.invalidateQueries({
          queryKey: ["simulationLogs", effectiveRunId.toString()],
        });
        // Keep the external generation record fresh so the in-progress
        // indicator resolves to Ready / no-result without a manual refresh.
        void queryClient.invalidateQueries({
          queryKey: ["videoGeneration", effectiveRunId.toString()],
        });
        // Actively poll the provider while a generation is in flight so a
        // still-processing prediction settles on its own.
        if (videoIsGenerating) void videoPollQuery.refetch();
      }
    },
    { intervalMs: POLL_INTERVAL_MS, enabled: isReady },
  );

  const selectRun = (id: bigint) => {
    void navigate({
      to: "/simulation",
      search: { runId: id.toString() },
    });
  };

  // Clear next steps from a decided run: advance to the next pipeline stage or
  // return to the Live Production Feed. Both are real destinations, so a
  // decided run is never a dead end.
  const handleAdvanceStage = () => {
    void navigate({ to: "/optimization" });
  };

  const handleReturnToFeed = () => {
    void navigate({ to: "/" });
  };

  // Open the run's generated videos, carrying the displayed revision so the
  // videos view reflects the same cut the operator reviewed.
  const handleViewVideos = () => {
    if (effectiveRunId === null) return;
    void navigate({
      to: "/videos",
      search: {
        runId: effectiveRunId.toString(),
        revision:
          displayedRevisionNumber !== null
            ? displayedRevisionNumber.toString()
            : undefined,
      },
    });
  };

  // Return to the feed with the halted run's prompt prefilled for revision.
  const handleRevisePrompt = (prompt: string) => {
    void navigate({ to: "/", search: { prompt } });
  };

  const handleStartNewRun = () => {
    void navigate({ to: "/" });
  };

  // Jump between pipeline stages from the stepper. Prompt returns to the feed;
  // Simulation and Review both live on this inspector; Videos opens the
  // generated videos view.
  const handleStepperNavigate = (stage: FlowStage) => {
    if (stage === "prompt") {
      void navigate({ to: "/" });
      return;
    }
    if (stage === "videos") {
      handleViewVideos();
      return;
    }
    if (effectiveRunId === null) return;
    void navigate({
      to: "/simulation",
      search: { runId: effectiveRunId.toString(), stage },
    });
  };

  const invalidateRun = (runId: bigint) => {
    const id = runId.toString();
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    void queryClient.invalidateQueries({ queryKey: ["runDecisions"] });
    void queryClient.invalidateQueries({ queryKey: ["run", id] });
    void queryClient.invalidateQueries({ queryKey: ["revisions", id] });
    void queryClient.invalidateQueries({ queryKey: ["runDecision", id] });
    void queryClient.invalidateQueries({ queryKey: ["mediaArtifact", id] });
  };

  const [isTweaking, setIsTweaking] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);

  const handleSubmitTweak = async (instruction: string) => {
    if (!actor || effectiveRunId === null || isTweaking) return;
    const runKey = effectiveRunId.toString();
    setIsTweaking(true);
    setTweakErrorState(null);
    try {
      // submitTweak returns promptly with the run's videoStatus set to
      // #generating; the new revision is appended in the background. Its return
      // value is always null, so it must not be read as a failure — the
      // appended revision is observed by polling listRevisions(runId).
      await actor.submitTweak({ runId: effectiveRunId, instruction });
      // Follow the latest revision again so the regenerated cut is displayed
      // once it lands, rather than pinning the previously selected revision.
      setSelectedRevision(null);
      invalidateRun(effectiveRunId);
    } catch (error) {
      setTweakErrorState({
        runId: runKey,
        message: backendErrorMessage(error),
      });
    } finally {
      setIsTweaking(false);
    }
  };

  const handleAccept = async () => {
    if (!actor || effectiveRunId === null || isDeciding) return;
    if (displayedRevisionNumber === null) return;
    const runKey = effectiveRunId.toString();
    setIsDeciding(true);
    setDecisionErrorState(null);
    try {
      await actor.acceptRun(effectiveRunId, displayedRevisionNumber);
      invalidateRun(effectiveRunId);
      toast.success(`Run #${runKey} approved`, {
        description:
          "Choose a next step below, or return to the Live Production Feed.",
      });
    } catch (error) {
      setDecisionErrorState({
        runId: runKey,
        message: backendErrorMessage(error),
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleReject = async (reason: string | null) => {
    if (!actor || effectiveRunId === null || isDeciding) return;
    const runKey = effectiveRunId.toString();
    setIsDeciding(true);
    setDecisionErrorState(null);
    try {
      await actor.rejectRun(effectiveRunId, reason);
      invalidateRun(effectiveRunId);
      toast.error(`Run #${runKey} rejected`, {
        description: "Return to the Live Production Feed to revise the prompt.",
      });
    } catch (error) {
      setDecisionErrorState({
        runId: runKey,
        message: backendErrorMessage(error),
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleContinue = async () => {
    if (!actor || effectiveRunId === null || isDeciding) return;
    if (displayedRevisionNumber === null) return;
    const runKey = effectiveRunId.toString();
    setIsDeciding(true);
    setDecisionErrorState(null);
    try {
      await actor.continueRun(effectiveRunId, displayedRevisionNumber);
      invalidateRun(effectiveRunId);
    } catch (error) {
      setDecisionErrorState({
        runId: runKey,
        message: backendErrorMessage(error),
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const tweakError =
    tweakErrorState && tweakErrorState.runId === effectiveRunKey
      ? tweakErrorState.message
      : null;
  const decisionError =
    decisionErrorState && decisionErrorState.runId === effectiveRunKey
      ? decisionErrorState.message
      : null;

  const isLoading =
    runsQuery.isLoading || (runQuery.isLoading && effectiveRunId !== null);
  const error = runsQuery.error ?? runQuery.error ?? logsQuery.error;

  const decisionValue = decisionQuery.data?.decision ?? null;
  const currentStage = run
    ? runFlowStage(run.status, decisionValue)
    : "simulation";
  const reachedStages: FlowStage[] = run
    ? reachedFlowStages(run.status, decisionValue)
    : ["prompt", "simulation"];

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="simulation.page"
    >
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <FlaskConical className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Simulation Inspector
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step-by-step evaluation logs for each production run.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-md"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["runs"] });
            if (effectiveRunId !== null) {
              void queryClient.invalidateQueries({
                queryKey: ["run", effectiveRunId.toString()],
              });
              void queryClient.invalidateQueries({
                queryKey: ["simulationLogs", effectiveRunId.toString()],
              });
            }
          }}
          data-ocid="simulation.refresh_button"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div
          className="mb-4 flex items-start gap-3 rounded-lg border border-status-halted/40 bg-status-halted/10 p-4"
          data-ocid="simulation.error_state"
        >
          <AlertCircle
            className="mt-0.5 size-4 shrink-0 text-status-halted"
            aria-hidden="true"
          />
          <p className="text-sm text-foreground">
            {backendErrorMessage(error)}
          </p>
        </div>
      ) : null}

      {run !== null ? (
        <ProgressStepper
          currentStage={currentStage}
          reachedStages={reachedStages}
          onNavigate={handleStepperNavigate}
          className="mb-4"
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-panel"
          data-ocid="simulation.run_list.panel"
        >
          <header className="flex items-center gap-2 px-1 pb-1">
            <ScrollText className="size-3.5 text-primary" aria-hidden="true" />
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Production Runs
            </h2>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
              {runs.length}
            </span>
          </header>

          {runsQuery.isLoading ? (
            <div
              className="flex flex-col gap-2"
              data-ocid="simulation.run_list.loading_state"
            >
              {Array.from({ length: 5 }, (_, i) => `run-skeleton-${i}`).map(
                (id) => (
                  <Skeleton key={id} className="h-14 w-full rounded-md" />
                ),
              )}
            </div>
          ) : runs.length === 0 ? (
            <p
              className="px-1 py-6 text-center font-mono text-[11px] text-muted-foreground"
              data-ocid="simulation.run_list.empty_state"
            >
              No production runs recorded yet.
            </p>
          ) : (
            <ul className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto">
              {runs.map((summary) => {
                const decision = decisionsByRun.get(summary.id.toString());
                const decided = isDecidedDecision(decision?.decision);
                const meta =
                  decided && decision
                    ? runDecisionMeta(decision.decision)
                    : runStatusMeta(summary.status);
                const selected = summary.id === effectiveRunId;
                return (
                  <li key={String(summary.id)}>
                    <button
                      type="button"
                      onClick={() => selectRun(summary.id)}
                      aria-current={selected ? "true" : undefined}
                      data-ocid="simulation.run_list.item"
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                        selected
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-background/50 hover:border-primary/30 hover:bg-secondary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-foreground">
                          #{String(summary.id)}
                        </span>
                        <StatusBadge
                          label={meta.label}
                          tone={meta.tone}
                          pulse={summary.status === RunStatus.running}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {formatRelative(summary.timestamp)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {isLoading ? (
            <div
              className="flex flex-col gap-4"
              data-ocid="simulation.loading_state"
            >
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : run === null ? (
            <div
              className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center"
              data-ocid="simulation.empty_state"
            >
              <FlaskConical
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-display text-sm font-semibold text-foreground">
                No run selected
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Select a production run from the list to inspect its full
                reasoning trail and evaluation stream.
              </p>
            </div>
          ) : (
            <>
              {videoIsGenerating ? (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-status-running/40 bg-status-running/10 px-4 py-3"
                  data-ocid="simulation.generating_state"
                >
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-status-running"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      Generating video…
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {videoModelName
                        ? `${videoModelName} · ${videoGeneration?.modelId ?? "model"}`
                        : (videoGeneration?.modelId ?? "model")}{" "}
                      · 1 prompt
                    </p>
                  </div>
                  <span
                    className="font-mono text-sm tabular-nums text-status-running"
                    data-ocid="simulation.generating_elapsed"
                  >
                    {formatElapsed(videoElapsedMs)}
                  </span>
                </div>
              ) : runIsGenerating ? (
                <div
                  className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3"
                  data-ocid="simulation.generating_state"
                >
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-primary"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-foreground">
                    {runIsActive
                      ? "This run is still processing. Its video cuts will appear once it finishes."
                      : "A new revision is being generated. The updated cut will appear here automatically."}
                  </p>
                </div>
              ) : null}
              <RunDetail
                run={run}
                ingredients={boundIngredients}
                revisions={revisions}
                decision={decisionQuery.data ?? null}
                selectedRevision={selectedRevision}
                onSelectRevision={setSelectedRevision}
                onSubmitTweak={handleSubmitTweak}
                isTweaking={isTweaking}
                tweakError={tweakError}
                onAccept={handleAccept}
                onReject={handleReject}
                onContinue={handleContinue}
                isDeciding={isDeciding}
                decisionError={decisionError}
                onAdvanceStage={handleAdvanceStage}
                onReturnToFeed={handleReturnToFeed}
                onViewVideos={handleViewVideos}
                onRevisePrompt={handleRevisePrompt}
                onStartNewRun={handleStartNewRun}
                logs={logsQuery.data ?? []}
                mediaSlot={
                  <div className="flex flex-col gap-4">
                    <GenerateVideosControl
                      runId={run.id}
                      accepted={decisionValue === RunDecision.approved}
                      mode={videoGeneration ? "rerun" : "generate"}
                    />
                    <VideoArtifactPanel
                      runId={run.id}
                      artifact={artifactQuery.data ?? run.mediaArtifact ?? null}
                      characters={charactersQuery.data ?? []}
                      cameos={cameosQuery.data ?? []}
                      linkedCharacterId={run.characterId}
                    />
                  </div>
                }
              />
              <LogStream
                logs={logsQuery.data ?? []}
                live={runIsActive || runIsGenerating || videoIsGenerating}
                className="min-h-[360px]"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
