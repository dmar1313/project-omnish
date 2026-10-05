import type { VideoGeneration, VideoModel, VideoPromptOption } from "@/backend";
import { VideoGenerationStatus } from "@/backend";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatElapsed, useElapsedTime } from "@/hooks/useElapsedTime";
import {
  useListRunPrompts,
  useRecoverVideoGeneration,
  useReplicateTokenStatus,
  useRerunVideoGeneration,
  useStartVideoGeneration,
  useVideoGeneration,
  useVideoModels,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface GenerateVideosControlProps {
  runId: bigint;
  /**
   * Whether the run has been accepted. Generation is only offered once a build
   * is accepted, so the control renders nothing before that.
   */
  accepted: boolean;
  /** Re-run reuses the exact prior prompt instead of starting fresh. */
  mode?: "generate" | "rerun";
  className?: string;
}

const GENERATING_STATUSES: VideoGenerationStatus[] = [
  VideoGenerationStatus.generating,
];

function isGenerating(status: VideoGenerationStatus | undefined): boolean {
  return status !== undefined && GENERATING_STATUSES.includes(status);
}

/**
 * The single surface for starting, watching, and re-running video generation.
 *
 * Before generating, the operator picks exactly one prompt/cut from the run's
 * available prompts; only that single prompt is submitted. The control renders
 * a prominent Generate Videos action with a model picker (Kling 3.0
 * preselected, Veo 3.1 marked premium), an unmistakable in-progress indicator
 * with spinner, status label, and live elapsed time, the chosen prompt
 * alongside the result, a recovery action for a generation already started on
 * the provider, and a clear explanation when no Replicate token is configured.
 */
export function GenerateVideosControl({
  runId,
  accepted,
  mode = "generate",
  className,
}: GenerateVideosControlProps) {
  const modelsQuery = useVideoModels();
  const tokenQuery = useReplicateTokenStatus();
  const generationQuery = useVideoGeneration(runId);
  const promptsQuery = useListRunPrompts(runId);
  const startGeneration = useStartVideoGeneration();
  const rerunGeneration = useRerunVideoGeneration();
  const recoverGeneration = useRecoverVideoGeneration();

  const models = useMemo<VideoModel[]>(
    () => modelsQuery.data ?? [],
    [modelsQuery.data],
  );
  const defaultModelId = useMemo(() => {
    const preferred = models.find((model) => model.default);
    return preferred?.id ?? models[0]?.id ?? "";
  }, [models]);

  const prompts = useMemo<VideoPromptOption[]>(
    () => promptsQuery.data ?? [],
    [promptsQuery.data],
  );

  const generation: VideoGeneration | null = generationQuery.data ?? null;

  const [modelId, setModelId] = useState<string>("");
  // Seed the picker without clobbering a choice the operator has already made.
  // In rerun mode the prior generation's model wins so a failed/no-result
  // generation retries with the exact prior model, not the backend default.
  useEffect(() => {
    if (modelId !== "") return;
    if (mode === "rerun" && generation?.modelId) {
      setModelId(generation.modelId);
      return;
    }
    if (defaultModelId !== "") setModelId(defaultModelId);
  }, [modelId, mode, generation, defaultModelId]);
  const generating = isGenerating(generation?.status);
  const elapsedMs = useElapsedTime(generation?.startedAt, generating);

  // The prompt the operator has chosen. Defaults to the first available option
  // (or the prior generation's prompt when re-running) without clobbering an
  // explicit choice.
  const [promptIndex, setPromptIndex] = useState<string>("");
  useEffect(() => {
    if (promptIndex !== "") return;
    if (mode === "rerun" && generation) {
      setPromptIndex(generation.promptIndex.toString());
      return;
    }
    if (prompts.length > 0) setPromptIndex(prompts[0].index.toString());
  }, [promptIndex, mode, generation, prompts]);

  const tokenConfigured = tokenQuery.data?.configured ?? false;
  const tokenLoading = tokenQuery.isLoading;
  const mutation = mode === "rerun" ? rerunGeneration : startGeneration;
  const isPending = mutation.isPending;

  const selectedModel = models.find((model) => model.id === modelId) ?? null;
  const selectedPrompt =
    prompts.find((prompt) => prompt.index.toString() === promptIndex) ?? null;
  const canGenerate =
    accepted &&
    tokenConfigured &&
    modelId !== "" &&
    promptIndex !== "" &&
    !generating &&
    !isPending;

  const handleGenerate = () => {
    if (!canGenerate) return;
    const chosen = BigInt(promptIndex);
    if (mode === "rerun") {
      rerunGeneration.mutate({ runId, modelId, promptIndex: chosen });
    } else {
      startGeneration.mutate({ runId, modelId, promptIndex: chosen });
    }
  };

  const handleRecover = () => {
    if (recoverGeneration.isPending) return;
    recoverGeneration.mutate(runId);
  };

  if (!accepted) return null;

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-panel",
        className,
      )}
      data-ocid="videos.generate.section"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Clapperboard className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
          {mode === "rerun" ? "Re-run video generation" : "Generate videos"}
        </h3>
        {generation ? (
          <StatusBadge
            className="ml-auto"
            label={generationStatusLabel(generation.status)}
            tone={generationStatusTone(generation.status)}
            pulse={generating}
          />
        ) : null}
      </header>

      {generating ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-status-running/40 bg-status-running/10 px-3 py-2.5"
          data-ocid="videos.generate.loading_state"
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
              {selectedModel?.name ?? generation?.modelId ?? "model"} · 1 prompt
            </p>
          </div>
          <span
            className="font-mono text-sm tabular-nums text-status-running"
            data-ocid="videos.generate.elapsed"
          >
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      ) : null}

      {generation?.status === VideoGenerationStatus.failed ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-halted/40 bg-status-halted/10 px-3 py-2 text-sm text-foreground"
          data-ocid="videos.generate.error_state"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-status-halted"
            aria-hidden="true"
          />
          <span>
            <span className="font-medium">Generation failed.</span>{" "}
            {generation.error ?? "The generator returned no result."}
          </span>
        </p>
      ) : null}

      {generation?.status === VideoGenerationStatus.no_result ? (
        <p
          className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground"
          data-ocid="videos.generate.no_result_state"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-status-pending"
            aria-hidden="true"
          />
          <span>
            The generator finished without producing a playable video. Re-run to
            try again with the same prompt.
          </span>
        </p>
      ) : null}

      {generation?.status === VideoGenerationStatus.ready ? (
        <p
          className="flex items-start gap-2 rounded-md border border-status-completed/40 bg-status-completed/10 px-3 py-2 text-sm text-foreground"
          data-ocid="videos.generate.ready_state"
        >
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-status-completed"
            aria-hidden="true"
          />
          <span>
            <span className="font-medium">Video ready.</span> The generated cut
            is attached to this run — open the videos view to play it.
          </span>
        </p>
      ) : null}

      {generation && !generating ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-border bg-secondary/40 px-3 py-2"
          data-ocid="videos.generate.chosen_prompt"
        >
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Generated from prompt #{String(generation.promptIndex)}
          </span>
          <p className="line-clamp-3 text-sm text-foreground">
            {generation.prompt}
          </p>
        </div>
      ) : null}

      {!tokenLoading && !tokenConfigured ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-status-pending/40 bg-status-pending/10 px-3 py-2.5"
          data-ocid="videos.generate.token_missing_state"
        >
          <p className="flex items-start gap-2 text-sm text-foreground">
            <KeyRound
              className="mt-0.5 size-4 shrink-0 text-status-pending"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium">A generator key is required.</span>{" "}
              Video generation runs on Replicate, which needs an
              admin-configured API token. Add one in settings to enable
              generation.
            </span>
          </p>
          <Button
            asChild
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-2 rounded-md"
          >
            <Link
              to="/settings/video"
              data-ocid="videos.generate.settings_link"
            >
              <KeyRound className="size-3.5" aria-hidden="true" />
              Open video settings
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`video-prompt-${String(runId)}`}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Prompt to generate
          </Label>
          <Select
            value={promptIndex}
            onValueChange={setPromptIndex}
            disabled={generating || isPending || prompts.length === 0}
          >
            <SelectTrigger
              id={`video-prompt-${String(runId)}`}
              className="w-full bg-background"
              data-ocid="videos.generate.prompt_select"
            >
              <SelectValue placeholder="Select a prompt" />
            </SelectTrigger>
            <SelectContent>
              {prompts.map((prompt) => (
                <SelectItem
                  key={prompt.index.toString()}
                  value={prompt.index.toString()}
                >
                  {prompt.agent} · {truncate(prompt.content, 64)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPrompt ? (
            <p
              className="line-clamp-2 text-xs text-muted-foreground"
              data-ocid="videos.generate.prompt_preview"
            >
              {selectedPrompt.content}
            </p>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              No prompts available for this run yet
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label
              htmlFor={`video-model-${String(runId)}`}
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              Video model
            </Label>
            <Select
              value={modelId}
              onValueChange={setModelId}
              disabled={generating || isPending || models.length === 0}
            >
              <SelectTrigger
                id={`video-model-${String(runId)}`}
                className="w-full bg-background"
                data-ocid="videos.generate.model_select"
              >
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                    {model.premium ? " · Premium" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModel ? (
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {selectedModel.provider}
                {selectedModel.premium ? " · premium tier" : " · standard tier"}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            size="sm"
            className="gap-2 rounded-md"
            onClick={handleGenerate}
            disabled={!canGenerate}
            data-ocid="videos.generate.primary_button"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : mode === "rerun" ? (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            ) : (
              <Play className="size-3.5" aria-hidden="true" />
            )}
            {mode === "rerun" ? "Re-run generation" : "Generate videos"}
          </Button>
        </div>
      </div>

      {mutation.isError ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm text-status-halted"
          data-ocid="videos.generate.mutation_error_state"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {backendErrorMessage(mutation.error)}
        </p>
      ) : null}

      {generation ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 rounded-md"
            onClick={handleRecover}
            disabled={recoverGeneration.isPending}
            data-ocid="videos.generate.recover_button"
          >
            {recoverGeneration.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="size-3.5" aria-hidden="true" />
            )}
            Recover from provider
          </Button>
          <p className="text-xs text-muted-foreground">
            Already started this on Replicate? Recover it instead of starting a
            new run.
          </p>
        </div>
      ) : null}

      {recoverGeneration.isError ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm text-status-halted"
          data-ocid="videos.generate.recover_error_state"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {backendErrorMessage(recoverGeneration.error)}
        </p>
      ) : null}

      {!tokenConfigured && !tokenLoading ? (
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3" aria-hidden="true" />
          Generation is disabled until a key is configured
        </p>
      ) : null}
    </section>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function generationStatusLabel(status: VideoGenerationStatus): string {
  switch (status) {
    case VideoGenerationStatus.generating:
      return "Generating";
    case VideoGenerationStatus.ready:
      return "Ready";
    case VideoGenerationStatus.no_result:
      return "No result";
    case VideoGenerationStatus.failed:
      return "Failed";
    default:
      return "Not started";
  }
}

function generationStatusTone(
  status: VideoGenerationStatus,
): "queued" | "running" | "completed" | "halted" {
  switch (status) {
    case VideoGenerationStatus.generating:
      return "running";
    case VideoGenerationStatus.ready:
      return "completed";
    case VideoGenerationStatus.failed:
      return "halted";
    default:
      return "queued";
  }
}
