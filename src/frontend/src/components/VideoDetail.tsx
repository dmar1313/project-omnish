import { VideoOutputStatus } from "@/backend";
import type { VideoOutput } from "@/components/GeneratedVideos";
import { formatDuration } from "@/components/GeneratedVideos";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  FileText,
  Loader2,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";

export interface VideoDetailProps {
  video: VideoOutput;
  /** Return to the video grid. */
  onBack: () => void;
  /** The character this run's video was built from, if known. */
  characterName?: string | null;
  /** The cameo capture this run's video was built from, if known. */
  cameoLabel?: string | null;
  /**
   * Removes this video's media artifact. When omitted, no delete action is
   * shown. Resolves once the backend has removed the artifact.
   */
  onDelete?: (video: VideoOutput) => Promise<unknown>;
  /** True while a delete is in flight, disabling the confirm action. */
  isDeleting?: boolean;
  className?: string;
}

/**
 * Detail view for a single generated video: a real inline HTML5 player plus the
 * cut's script, continuity notes, and the cameo/character it was built from.
 * When the run produced no playable media, the player shows an honest empty
 * state rather than a placeholder pretending to be a video. When `onDelete` is
 * provided, a confirmed delete action removes the video and returns to the grid.
 */
export function VideoDetail({
  video,
  onBack,
  characterName = null,
  cameoLabel = null,
  onDelete,
  isDeleting = false,
  className,
}: VideoDetailProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const generating =
    video.mediaUrl === null &&
    video.videoStatus === VideoOutputStatus.generating;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-md"
          onClick={onBack}
          data-ocid="videos.detail.back_button"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All videos
        </Button>
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
            {video.title}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {video.platform} · {video.aspectRatio}
            {generating
              ? " · Generating…"
              : ` · ${formatDuration(video.durationSeconds)}`}
          </p>
        </div>
        {onDelete ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto gap-2 rounded-md text-muted-foreground hover:border-destructive/50 hover:text-destructive"
            onClick={() => setConfirming(true)}
            data-ocid="videos.detail.delete_button"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete video
          </Button>
        ) : null}
      </div>

      <section
        className="overflow-hidden rounded-lg border border-border bg-card p-3 shadow-panel"
        data-ocid="videos.detail.player"
      >
        <VideoPlayer
          src={video.mediaUrl}
          title={`${video.title} — ${video.platform}`}
          aspectRatio={video.aspectRatio}
          generating={generating}
          emptyMessage="No playable video was produced for this cut. The run's script and notes are still available below."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="videos.detail.script.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Script
            </h3>
          </header>
          {video.script ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {video.script}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              No script recorded for this cut.
            </p>
          )}
        </section>

        <section
          className="rounded-lg border border-border bg-card p-4 shadow-panel"
          data-ocid="videos.detail.continuity.section"
        >
          <header className="mb-3 flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              Continuity Notes
            </h3>
          </header>
          {video.continuityNotes ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {video.continuityNotes}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              No continuity notes recorded for this cut.
            </p>
          )}
        </section>
      </div>

      <section
        className="rounded-lg border border-border bg-card p-4 shadow-panel"
        data-ocid="videos.detail.cameo.section"
      >
        <header className="mb-3 flex items-center gap-2">
          <UserRound className="size-4 text-primary" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
            Built from
          </h3>
        </header>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Character
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {characterName ?? "No character linked to this run"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Cameo
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {cameoLabel ?? "No cameo capture linked"}
            </dd>
          </div>
        </dl>
      </section>

      {onDelete ? (
        <Dialog
          open={confirming}
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(false);
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
                  {video.title}
                </span>{" "}
                from this run. The run and its script stay, but the video will
                no longer appear here. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p
                className="text-sm text-destructive"
                data-ocid="videos.detail.delete_error"
              >
                {deleteError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirming(false);
                  setDeleteError(null);
                }}
                data-ocid="videos.detail.delete_cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteError(null);
                  void onDelete(video)
                    .then(() => {
                      setConfirming(false);
                      onBack();
                    })
                    .catch((error: unknown) => {
                      setDeleteError(
                        error instanceof Error
                          ? error.message
                          : "Could not delete this video. Please try again.",
                      );
                    });
                }}
                data-ocid="videos.detail.delete_confirm_button"
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
    </div>
  );
}
