import type {
  CameoCapture,
  DnaRecord,
  MediaArtifact,
  ProductionRun,
  Revision,
  RunDecisionState,
  RunSummary,
} from "@/backend";
import { RunDecision, RunStatus, VideoGenerationStatus } from "@/backend";
import { GenerateVideosControl } from "@/components/GenerateVideosControl";
import {
  GeneratedVideos,
  GeneratedVideosEmptyState,
  type VideoOutput,
  deriveVideoOutputs,
} from "@/components/GeneratedVideos";
import { ProgressStepper } from "@/components/ProgressStepper";
import { StatusBadge } from "@/components/StatusBadge";
import { VideoDetail } from "@/components/VideoDetail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackend } from "@/hooks/useBackend";
import { formatElapsed, useElapsedTime } from "@/hooks/useElapsedTime";
import { usePolling } from "@/hooks/usePolling";
import {
  useDeleteMediaArtifact,
  usePollVideoGeneration,
  useRecoverVideoGeneration,
  useRerunVideoGeneration,
  useRunList,
  useRunRevisions,
  useStartVideoGeneration,
  useVideoGeneration,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import {
  formatRelative,
  formatTimestamp,
  isVideoGenerating,
  runStatusMeta,
} from "@/lib/status";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertCircle,
  Clapperboard,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function parseRunId(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

function parseRevision(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

export default function GeneratedVideosPage() {
  const { actor, isReady } = useBackend();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const runId = parseRunId(search.runId);
  const requestedRevision = parseRevision(search.revision);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  // Set once a delete succeeds for this run, so cuts that legitimately had no
  // artifact before the delete keep rendering, but the deleted video's
  // artifact-less cuts are suppressed afterwards.
  const [deletedRunId, setDeletedRunId] = useState<bigint | null>(null);
  const deleteArtifact = useDeleteMediaArtifact();

  const runQuery = useQuery<ProductionRun | null>({
    queryKey: ["run", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return null;
      return actor.getRun(runId);
    },
    enabled: isReady && runId !== null,
  });

  const revisionsQuery = useQuery<Revision[]>({
    queryKey: ["revisions", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return [];
      return actor.listRevisions(runId);
    },
    enabled: isReady && runId !== null,
  });

  const artifactQuery = useQuery<MediaArtifact | null>({
    queryKey: ["mediaArtifact", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return null;
      return actor.getMediaArtifact(runId);
    },
    enabled: isReady && runId !== null,
  });

  const charactersQuery = useQuery<DnaRecord[]>({
    queryKey: ["dna"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listDna();
    },
    enabled: isReady && runId !== null,
  });

  const cameosQuery = useQuery<CameoCapture[]>({
    queryKey: ["cameos"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listCameos();
    },
    enabled: isReady && runId !== null,
  });

  const run = runQuery.data ?? null;

  // External generation is tracked by its own record, not by the run's
  // videoStatus (the backend does not flip run.videoStatus to #generating while
  // an external provider runs). Polling this query is what resolves the
  // spinner to a finished video without a full page reload.
  const generationQuery = useVideoGeneration(runId);
  const generation = generationQuery.data ?? null;
  const generationGenerating =
    generation?.status === VideoGenerationStatus.generating;

  // Generation is only offered once the run has been explicitly approved, the
  // same gate SimulationPage applies. A completed-but-undecided run must not
  // expose the generation control.
  const decisionQuery = useQuery<RunDecisionState | null>({
    queryKey: ["runDecision", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return null;
      return actor.getRunDecision(runId);
    },
    enabled: isReady && runId !== null,
  });
  const accepted = decisionQuery.data?.decision === RunDecision.approved;

  // While the run is still producing its video, keep the run/revision/artifact
  // queries fresh so the generating state resolves to a final state on its own.
  const generating = run
    ? isVideoGenerating(run.status, run.videoStatus)
    : false;

  // The generating window is driven by either the run's own lifecycle or the
  // external generation record. The elapsed timer starts from the external
  // record's start when present, otherwise the run's own timestamp.
  const isGenerating = generating || generationGenerating;
  const generatingStartedAt = generation?.startedAt ?? run?.timestamp ?? null;
  const generatingElapsedMs = useElapsedTime(generatingStartedAt, isGenerating);

  // While the external generation is `#generating`, actively poll the provider
  // through the backend so a still-processing prediction settles to ready /
  // failed without a manual refresh. `pollVideoGeneration` writes the settled
  // state; the read query then observes it.
  const pollQuery = usePollVideoGeneration(runId, generationGenerating);
  const recoverGeneration = useRecoverVideoGeneration();

  // When the generation settles from #generating to a terminal state, the
  // provider's output URL has just been attached to the run as its media
  // artifact. The run/artifact/revision queries were fetched before that write,
  // so they must be refetched once the generation is no longer in flight —
  // otherwise a ready video never appears without a manual refresh.
  const generationSettled = generation !== null && !generationGenerating;
  useEffect(() => {
    if (!generationSettled) return;
    void runQuery.refetch();
    void revisionsQuery.refetch();
    void artifactQuery.refetch();
  }, [generationSettled, runQuery, revisionsQuery, artifactQuery]);

  usePolling(
    () => {
      void runQuery.refetch();
      void revisionsQuery.refetch();
      void artifactQuery.refetch();
      void generationQuery.refetch();
      void decisionQuery.refetch();
      if (generationGenerating) void pollQuery.refetch();
    },
    { intervalMs: 2500, enabled: generating || generationGenerating },
  );

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

  // Reflect the requested revision, otherwise the latest (matching the
  // Simulation Inspector's fallback), so tweaked revisions show their outputs.
  const displayedRevision = useMemo(() => {
    if (requestedRevision !== null) {
      const match = revisions.find(
        (revision) => revision.revisionNumber === requestedRevision,
      );
      if (match) return match;
    }
    return revisions[revisions.length - 1] ?? null;
  }, [requestedRevision, revisions]);

  const artifact = artifactQuery.data ?? run?.mediaArtifact ?? null;

  const videos = useMemo<VideoOutput[]>(() => {
    if (!run) return [];
    // The external generation record is the only signal that a cut is still
    // being produced (the backend leaves run.videoStatus at #no_result while an
    // external provider runs), so it must drive the per-cut loading state.
    const derived = deriveVideoOutputs(
      run,
      displayedRevision,
      artifact,
      generationGenerating,
    );
    // After a delete, the artifact is gone but the revision's format cuts
    // remain, so deriveVideoOutputs still returns them with a null mediaUrl.
    // Suppress those artifact-less cuts so the deleted video drops from the
    // grid and the empty state takes over.
    if (deletedRunId !== null && runId === deletedRunId) {
      return derived.filter((video) => video.mediaUrl !== null);
    }
    return derived;
  }, [
    run,
    displayedRevision,
    artifact,
    deletedRunId,
    runId,
    generationGenerating,
  ]);

  const selectedVideo =
    videos.find((video) => video.id === selectedVideoId) ?? null;

  // Resolve the character and cameo a run's video was built from, so the video
  // page can show that context alongside the output.
  const characterName = useMemo(() => {
    if (!run?.characterId) return null;
    const match = (charactersQuery.data ?? []).find(
      (record) => record.id === run.characterId,
    );
    return match
      ? match.characterName
      : `Character #${String(run.characterId)}`;
  }, [run, charactersQuery.data]);

  const cameoLabel = useMemo(() => {
    if (!run?.characterId) return null;
    const match = (cameosQuery.data ?? []).find(
      (cameo) => cameo.characterId === run.characterId,
    );
    if (!match) return null;
    const shots = [
      match.frontAssetId !== undefined ? "front" : null,
      match.leftAssetId !== undefined ? "left" : null,
      match.rightAssetId !== undefined ? "right" : null,
      match.voiceAssetId !== undefined ? "voice" : null,
    ].filter((value): value is string => value !== null);
    return shots.length > 0
      ? `Cameo #${String(match.id)} · ${shots.join(", ")}`
      : `Cameo #${String(match.id)}`;
  }, [run, cameosQuery.data]);

  const goToFeed = () => {
    void navigate({ to: "/" });
  };

  // Deleting removes the run's media artifact; the invalidated queries drop the
  // video from the grid and detail view, and the empty state takes over.
  const handleDelete = async () => {
    if (runId === null) return;
    await deleteArtifact.mutateAsync(runId);
    setDeletedRunId(runId);
    setSelectedVideoId(null);
  };

  const goToSimulation = () => {
    if (runId === null) {
      void navigate({ to: "/simulation", search: {} });
      return;
    }
    void navigate({
      to: "/simulation",
      search: { runId: runId.toString() },
    });
  };

  const isLoading =
    runId !== null &&
    (runQuery.isLoading || revisionsQuery.isLoading || artifactQuery.isLoading);
  const error = runQuery.error ?? revisionsQuery.error ?? artifactQuery.error;

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="videos.page"
    >
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <Clapperboard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Generated Videos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Finished cuts produced by a run, adapted for every target platform.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-md"
          onClick={() => {
            void runQuery.refetch();
            void revisionsQuery.refetch();
            void artifactQuery.refetch();
            void generationQuery.refetch();
          }}
          data-ocid="videos.refresh_button"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      <div
        className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
        data-ocid="videos.capability_notice"
      >
        <Info
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          This platform does not generate photorealistic cameo video with AI.
          Every video here is real footage you supplied and attached to a run —
          the pipeline writes and adapts the script, but it does not synthesize
          a likeness.
        </p>
      </div>

      {runId !== null ? (
        <ProgressStepper
          currentStage="videos"
          reachedStages={["prompt", "simulation", "review", "videos"]}
          onNavigate={(stage) => {
            if (stage === "prompt") goToFeed();
            else if (stage === "videos") return;
            else goToSimulation();
          }}
          className="mb-4"
        />
      ) : null}

      {error ? (
        <div
          className="mb-4 flex items-start gap-3 rounded-lg border border-status-halted/40 bg-status-halted/10 p-4"
          data-ocid="videos.error_state"
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

      {runId === null ? (
        <RecentRunsPanel onStartRun={goToFeed} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => `video-skeleton-${i}`).map(
            (id) => (
              <Skeleton key={id} className="h-56 w-full rounded-lg" />
            ),
          )}
        </div>
      ) : run === null ? (
        <div
          className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center"
          data-ocid="videos.not_found_state"
        >
          <Clapperboard
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-display text-sm font-semibold text-foreground">
            Run not found
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This run is no longer available. Return to the feed to start a new
            production run.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-1 rounded-md"
            onClick={goToFeed}
            data-ocid="videos.start_run_button"
          >
            Start a new run
          </Button>
        </div>
      ) : selectedVideo ? (
        <VideoDetail
          video={selectedVideo}
          onBack={() => setSelectedVideoId(null)}
          characterName={characterName}
          cameoLabel={cameoLabel}
          onDelete={handleDelete}
          isDeleting={deleteArtifact.isPending}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-panel">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Run #{String(run.id)}
              </p>
              <p className="mt-0.5 truncate text-sm text-foreground">
                {run.rawInput}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {displayedRevision ? (
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  v{String(displayedRevision.revisionNumber)}
                </span>
              ) : null}
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTimestamp(run.timestamp)}
              </span>
            </div>
          </div>

          {characterName ? (
            <p
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              data-ocid="videos.character_context"
            >
              Built from {characterName}
              {cameoLabel ? ` · ${cameoLabel}` : ""}
            </p>
          ) : null}

          {isGenerating ? (
            <div
              className="flex flex-wrap items-center gap-3 rounded-lg border border-status-running/40 bg-status-running/10 px-4 py-3"
              data-ocid="videos.generating_state"
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
                  {generation?.modelId ?? "model"} · 1 prompt
                </p>
              </div>
              <span
                className="font-mono text-sm tabular-nums text-status-running"
                data-ocid="videos.generating_elapsed"
              >
                {formatElapsed(generatingElapsedMs)}
              </span>
            </div>
          ) : null}

          {generation && !isGenerating ? (
            <div
              className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 shadow-panel"
              data-ocid="videos.chosen_prompt"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Generated from prompt #{String(generation.promptIndex)}
              </span>
              <p className="line-clamp-3 text-sm text-foreground">
                {generation.prompt}
              </p>
            </div>
          ) : null}

          {generation ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 rounded-md"
                onClick={() => recoverGeneration.mutate(run.id)}
                disabled={recoverGeneration.isPending}
                data-ocid="videos.recover_button"
              >
                {recoverGeneration.isPending ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                )}
                Recover from provider
              </Button>
              <p className="text-xs text-muted-foreground">
                Already started this on Replicate? Recover it instead of
                starting a new run.
              </p>
            </div>
          ) : null}

          {recoverGeneration.isError ? (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-status-halted"
              data-ocid="videos.recover_error_state"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {backendErrorMessage(recoverGeneration.error)}
            </p>
          ) : null}

          <GenerateVideosControl
            runId={run.id}
            accepted={accepted}
            mode={generation ? "rerun" : "generate"}
          />

          <GeneratedVideos
            videos={videos}
            selectedVideoId={selectedVideoId}
            onSelect={(video) => setSelectedVideoId(video.id)}
            onDelete={handleDelete}
            isDeleting={deleteArtifact.isPending}
            generatingStartedAt={generatingStartedAt}
            emptyState={
              isGenerating ? (
                <GeneratedVideosEmptyState
                  onStartRun={goToFeed}
                  title="Generating video…"
                  description="This run is still producing its video cuts. They will appear here automatically once processing finishes — no reload needed."
                />
              ) : (
                <GeneratedVideosEmptyState
                  onStartRun={goToFeed}
                  title="No video was produced for this run"
                  description="This run completed without a playable video attached. The pipeline produced script and format text only — attach a video to the run to see it here."
                />
              )
            }
          />
        </div>
      )}
    </div>
  );
}

interface RecentRunsPanelProps {
  onStartRun: () => void;
}

/**
 * Context-aware landing for `/videos` with nothing selected: the recent runs
 * with their prompts, each offering a Generate/Re-run action that reuses the
 * exact prior prompts. Never a blank dead end — an empty registry still offers
 * a clear path back to the feed.
 */
function RecentRunsPanel({ onStartRun }: RecentRunsPanelProps) {
  const runsQuery = useRunList();
  const runs = useMemo<RunSummary[]>(
    () => runsQuery.data ?? [],
    [runsQuery.data],
  );

  if (runsQuery.isLoading) {
    return (
      <div
        className="flex flex-col gap-3"
        data-ocid="videos.recent.loading_state"
      >
        {Array.from({ length: 3 }, (_, i) => `recent-run-skeleton-${i}`).map(
          (id) => (
            <Skeleton key={id} className="h-24 w-full rounded-lg" />
          ),
        )}
      </div>
    );
  }

  if (runsQuery.error) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-status-halted/40 bg-status-halted/10 p-4"
        data-ocid="videos.recent.error_state"
      >
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-status-halted"
          aria-hidden="true"
        />
        <p className="text-sm text-foreground">
          {backendErrorMessage(runsQuery.error)}
        </p>
      </div>
    );
  }

  if (runs.length === 0) {
    return <GeneratedVideosEmptyState onStartRun={onStartRun} />;
  }

  return (
    <section className="flex flex-col gap-3" data-ocid="videos.recent.section">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">
          Recent runs
        </h2>
        <p className="text-xs text-muted-foreground">
          Pick a run to see its cuts, or re-run generation with the same
          prompts.
        </p>
      </div>
      <ul className="flex flex-col gap-3" data-ocid="videos.recent.list">
        {runs.map((run, index) => (
          <RecentRunRow key={String(run.id)} run={run} index={index} />
        ))}
      </ul>
    </section>
  );
}

interface RecentRunRowProps {
  run: RunSummary;
  index: number;
}

function RecentRunRow({ run, index }: RecentRunRowProps) {
  const { actor, isReady } = useBackend();
  const generationQuery = useVideoGeneration(run.id);
  const revisionsQuery = useRunRevisions(run.id);
  const startGeneration = useStartVideoGeneration();
  const rerunGeneration = useRerunVideoGeneration();
  const generation = generationQuery.data ?? null;
  const generating = generation?.status === VideoGenerationStatus.generating;
  const meta = runStatusMeta(run.status);

  // Generation is only offered for a completed run that has been explicitly
  // approved — the same gate GenerateVideosControl enforces. A run that is
  // still running/halted/failed, or completed but undecided/rejected, must not
  // expose the Re-run action: startVideoGeneration traps for a non-completed
  // run, and generating from an unapproved run contradicts the accepted-run
  // requirement.
  const decisionQuery = useQuery<RunDecisionState | null>({
    queryKey: ["runDecision", run.id.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getRunDecision(run.id);
    },
    enabled: isReady,
  });
  const accepted = decisionQuery.data?.decision === RunDecision.approved;
  const canGenerate = run.status === RunStatus.completed && accepted;

  // While this run's generation is in flight, keep its record fresh so the
  // Generating badge resolves to Ready / no-result without a manual refresh.
  usePolling(
    () => {
      void generationQuery.refetch();
    },
    { intervalMs: 2500, enabled: generating },
  );

  // RunSummary carries no rawInput, so the prompt is read from the run's
  // revisions: the latest revision's generated assets are the exact optimized
  // prompts the backend would send (matching its runPrompts derivation). Fall
  // back to the recorded generation's chosen prompt when no revision is
  // available.
  const prompts = useMemo(() => {
    const revisions = revisionsQuery.data ?? [];
    const latest = revisions.reduce<Revision | null>(
      (acc, revision) =>
        acc === null || revision.revisionNumber > acc.revisionNumber
          ? revision
          : acc,
      null,
    );
    const fromRevision = latest
      ? latest.generatedAssets.map((asset) => asset.content)
      : [];
    if (fromRevision.length > 0) return fromRevision;
    return generation ? [generation.prompt] : [];
  }, [revisionsQuery.data, generation]);

  const promptPreview = prompts.length > 0 ? prompts.join(" · ") : null;

  // Re-run starts a new generation reusing this run's exact prior prompt. A
  // run with a recorded generation re-runs it (the backend replays the stored
  // prompt); a run that never generated starts fresh from the same derived
  // prompt. Either way the prompt is the run's own, never blank. The action is
  // only offered for a completed, approved run.
  const mutation = generation ? rerunGeneration : startGeneration;
  const isPending = mutation.isPending;
  const canRerun = canGenerate && !generating && !isPending;

  const handleRerun = () => {
    if (!canRerun) return;
    mutation.mutate({ runId: run.id });
  };

  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-panel sm:flex-row sm:items-center"
      data-ocid={`videos.recent.item.${index + 1}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Run #{String(run.id)}
          </span>
          <StatusBadge label={meta.label} tone={meta.tone} />
          {generating ? (
            <span
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-status-running"
              data-ocid={`videos.recent.generating_state.${index + 1}`}
            >
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Generating
            </span>
          ) : null}
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatRelative(run.timestamp)}
          </span>
        </div>
        <p
          className="mt-1.5 line-clamp-2 text-sm text-foreground"
          data-ocid={`videos.recent.prompt.${index + 1}`}
        >
          {promptPreview ?? "No prompt recorded for this run."}
        </p>
        {mutation.isError ? (
          <p
            role="alert"
            className="mt-1.5 flex items-start gap-1.5 text-xs text-status-halted"
            data-ocid={`videos.recent.rerun_error.${index + 1}`}
          >
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            {backendErrorMessage(mutation.error)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          asChild
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-md"
        >
          <Link
            to="/videos"
            search={{ runId: run.id.toString() }}
            data-ocid={`videos.recent.open_button.${index + 1}`}
          >
            <Clapperboard className="size-3.5" aria-hidden="true" />
            View cuts
          </Link>
        </Button>
        {canGenerate ? (
          <Button
            type="button"
            size="sm"
            className="gap-2 rounded-md"
            onClick={handleRerun}
            disabled={!canRerun}
            data-ocid={`videos.recent.rerun_button.${index + 1}`}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            )}
            Re-run
          </Button>
        ) : null}
      </div>
    </li>
  );
}
