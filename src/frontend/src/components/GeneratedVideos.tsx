import type {
  AgentOutput,
  FormatAdapterOutput,
  MediaArtifact,
  ProductionRun,
  Revision,
} from "@/backend";
import { AgentKind, VideoOutputStatus } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatElapsed, useElapsedTime } from "@/hooks/useElapsedTime";
import { isVideoGenerating } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Clapperboard, Film, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

/** A finished video output derived from a run's media artifact. */
export interface VideoOutput {
  id: string;
  title: string;
  platform: string;
  aspectRatio: string;
  /** Duration in seconds, read from the media file. */
  durationSeconds: number;
  /** The real playable media URL, or null when no video was produced. */
  mediaUrl: string | null;
  /**
   * The run's video lifecycle state. `#generating` means the cut is still being
   * produced and must show a loading state, never a final no-result card.
   */
  videoStatus: VideoOutputStatus;
  /** The script / caption text for this cut. */
  script: string;
  /** Continuity notes carried alongside the cut. */
  continuityNotes: string;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function continuityFrom(outputs: AgentOutput[]): string {
  const continuity = outputs.find(
    (output) => output.agent === AgentKind.continuity,
  );
  return continuity?.content ?? "";
}

/**
 * Derives the finished video outputs for a run (or a specific revision).
 *
 * A run's real video is the attached media artifact. When one exists, every
 * adapted platform format becomes a cut that plays that same media file, with
 * its duration and aspect ratio taken from the artifact. When no artifact
 * exists, the run produced no playable video and the cuts carry a null
 * `mediaUrl` so the UI can show an honest empty state.
 */
export function deriveVideoOutputs(
  run: ProductionRun,
  revision?: Revision | null,
  artifact?: MediaArtifact | null,
  /**
   * True while an external generation for this run is still in flight. The
   * backend does not flip `run.videoStatus` to `#generating` for external
   * generation, so the run's own lifecycle alone would render a terminal
   * no-result cut while the page banner says generating. Passing the external
   * generation's state keeps every cut in its loading state until it settles.
   */
  externalGenerating = false,
): VideoOutput[] {
  const outputs = revision ? revision.generatedAssets : run.generatedAssets;
  const formats = revision ? revision.formatOutputs : run.formatOutputs;
  const continuityNotes = continuityFrom(outputs);

  const media = artifact ?? run.mediaArtifact ?? null;
  const mediaUrl = media?.storageUrl ?? null;
  const durationSeconds = media?.durationSeconds ?? 0;
  const artifactRatio = media?.aspectRatio ?? "16:9";
  // A real artifact always wins: once media is attached the cut is ready,
  // regardless of what the run's lifecycle field says. Otherwise the cut is
  // generating while the run is still pending/running, while the backend
  // reports #generating, or while an external generation is in flight; only a
  // finished run with no media and no in-flight generation is an honest
  // no-result.
  const videoStatus = mediaUrl
    ? VideoOutputStatus.ready
    : isVideoGenerating(run.status, run.videoStatus) || externalGenerating
      ? VideoOutputStatus.generating
      : VideoOutputStatus.no_result;

  if (formats.length > 0) {
    return formats.map((format: FormatAdapterOutput, index: number) => ({
      id: `${format.platform}-${index}`,
      title: `${format.platform} cut`,
      platform: format.platform,
      aspectRatio: format.aspectRatio || artifactRatio,
      durationSeconds,
      mediaUrl,
      videoStatus,
      script: format.content,
      continuityNotes,
    }));
  }

  const visual = outputs.find((output) => output.agent === AgentKind.visual);
  if (!visual && !media) return [];

  return [
    {
      id: "master-cut",
      title: "Master cut",
      platform: "Master",
      aspectRatio: artifactRatio,
      durationSeconds,
      mediaUrl,
      videoStatus,
      script: visual?.content ?? "",
      continuityNotes,
    },
  ];
}

/**
 * The in-progress state for a single cut: a spinner, a status label, and a live
 * elapsed timer that ticks once per second while the cut is being produced.
 */
function GeneratingCardState({
  ocid,
  startedAt,
}: {
  ocid: string;
  startedAt: bigint | null;
}) {
  const elapsedMs = useElapsedTime(startedAt, true);
  return (
    <span
      className="flex size-full flex-col items-center justify-center gap-2 text-primary"
      data-ocid={ocid}
    >
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="font-mono text-[10px] uppercase tracking-wider">
        Generating video…
      </span>
      <span
        className="font-mono text-[10px] tabular-nums text-status-running"
        data-ocid={`${ocid}.elapsed`}
      >
        {formatElapsed(elapsedMs)}
      </span>
    </span>
  );
}

export interface GeneratedVideosProps {
  videos: VideoOutput[];
  /** The currently selected video id, if any. */
  selectedVideoId?: string | null;
  onSelect: (video: VideoOutput) => void;
  /** Shown when no videos exist yet. */
  emptyState?: React.ReactNode;
  /**
   * Removes a video's media artifact. When omitted, no delete action is shown.
   * Resolves once the backend has removed the artifact.
   */
  onDelete?: (video: VideoOutput) => Promise<unknown>;
  /** True while a delete is in flight, disabling the confirm action. */
  isDeleting?: boolean;
  /**
   * The nanosecond start timestamp of the in-flight generation, used to render
   * a live elapsed timer on each generating cut. Null when unknown.
   */
  generatingStartedAt?: bigint | null;
  className?: string;
}

/**
 * Grid of finished video outputs, each with a real playable preview, title,
 * and duration. Selecting a card opens its detail view. When `onDelete` is
 * provided, each card also exposes a delete action that confirms first.
 */
export function GeneratedVideos({
  videos,
  selectedVideoId = null,
  onSelect,
  emptyState,
  onDelete,
  isDeleting = false,
  generatingStartedAt = null,
  className,
}: GeneratedVideosProps) {
  const [pendingDelete, setPendingDelete] = useState<VideoOutput | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (videos.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <>
      <ul
        className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}
        data-ocid="videos.list"
      >
        {videos.map((video, index) => {
          const selected = video.id === selectedVideoId;
          const generating =
            video.mediaUrl === null &&
            video.videoStatus === VideoOutputStatus.generating;
          return (
            <li key={video.id} className="relative">
              <button
                type="button"
                onClick={() => onSelect(video)}
                aria-current={selected ? "true" : undefined}
                data-ocid={`videos.item.${index + 1}`}
                className={cn(
                  "group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left shadow-panel transition-colors",
                  selected
                    ? "border-primary/50"
                    : "border-border hover:border-primary/30",
                )}
              >
                <span className="relative block aspect-video w-full overflow-hidden bg-terminal">
                  {video.mediaUrl ? (
                    <video
                      src={video.mediaUrl}
                      muted
                      playsInline
                      preload="metadata"
                      tabIndex={-1}
                      className="size-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : generating ? (
                    <GeneratingCardState
                      ocid={`videos.generating_state.${index + 1}`}
                      startedAt={generatingStartedAt}
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                      <Clapperboard className="size-6" aria-hidden="true" />
                      <span className="font-mono text-[10px] uppercase tracking-wider">
                        No video produced
                      </span>
                    </span>
                  )}
                  {video.mediaUrl ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex size-10 items-center justify-center rounded-full border border-primary/50 bg-background/80 text-primary">
                        <Play
                          className="size-4 translate-x-px"
                          aria-hidden="true"
                        />
                      </span>
                    </span>
                  ) : null}
                  {video.mediaUrl ? (
                    <span className="absolute bottom-2 right-2 rounded-sm border border-terminal-border bg-terminal/90 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-terminal-foreground">
                      {formatDuration(video.durationSeconds)}
                    </span>
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-sm border border-primary/40 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                    {video.aspectRatio}
                  </span>
                </span>
                <span className="flex min-w-0 flex-col gap-1 p-3">
                  <span className="flex items-center gap-2">
                    <Film
                      className="size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
                      {video.title}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {video.platform}
                    {generating
                      ? " · Generating…"
                      : ` · ${formatDuration(video.durationSeconds)}`}
                  </span>
                </span>
              </button>
              {onDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Delete ${video.title}`}
                  onClick={() => setPendingDelete(video)}
                  data-ocid={`videos.delete_button.${index + 1}`}
                  className="absolute right-2 top-2 size-8 rounded-md border-border bg-background/85 text-muted-foreground backdrop-blur hover:border-destructive/50 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {onDelete ? (
        <Dialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null);
              setDeleteError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Delete video</DialogTitle>
              <DialogDescription>
                This removes{" "}
                <span className="font-medium text-foreground">
                  {pendingDelete?.title}
                </span>{" "}
                from this run. The run and its script stay, but the video will
                no longer appear here. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p
                className="text-sm text-destructive"
                data-ocid="videos.delete_error"
              >
                {deleteError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
                data-ocid="videos.delete_cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
                onClick={() => {
                  if (!pendingDelete) return;
                  setDeleteError(null);
                  void onDelete(pendingDelete)
                    .then(() => setPendingDelete(null))
                    .catch((error: unknown) => {
                      setDeleteError(
                        error instanceof Error
                          ? error.message
                          : "Could not delete this video. Please try again.",
                      );
                    });
                }}
                data-ocid="videos.delete_confirm_button"
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                Delete video
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export interface GeneratedVideosEmptyStateProps {
  /** Link back to the feed to start a new run. */
  onStartRun: () => void;
  /** Optional custom headline. */
  title?: string;
  /** Optional custom explanation. */
  description?: string;
}

/** Empty state shown before any run has produced video outputs. */
export function GeneratedVideosEmptyState({
  onStartRun,
  title = "No generated videos yet",
  description = "Videos appear here once a production run completes and its video is attached. Start a run from the Live Production Feed and its finished cuts will show up automatically.",
}: GeneratedVideosEmptyStateProps) {
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center"
      data-ocid="videos.empty_state"
    >
      <Clapperboard
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="font-display text-sm font-semibold text-foreground">
        {title}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button
        type="button"
        size="sm"
        className="mt-1 gap-2 rounded-md"
        onClick={onStartRun}
        data-ocid="videos.start_run_button"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Start a new run
      </Button>
    </div>
  );
}
