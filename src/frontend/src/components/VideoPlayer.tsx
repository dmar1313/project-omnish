import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface VideoPlayerProps {
  /** The real media URL to play. When absent, an honest empty state is shown. */
  src?: string | null;
  /** Optional poster image shown before playback begins. */
  poster?: string;
  /** Accessible label for the video element. */
  title: string;
  /** Aspect ratio (e.g. "9:16") used to size the frame before metadata loads. */
  aspectRatio?: string;
  className?: string;
  /** Rendered when no playable source exists. */
  emptyMessage?: string;
  /**
   * True while the cut is still being produced. Takes precedence over the
   * empty state so a generating cut never reads as a finished no-result.
   */
  generating?: boolean;
}

const RATIO_CLASS: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "16:9": "aspect-video",
  "4:5": "aspect-[4/5]",
  "4:3": "aspect-[4/3]",
};

function ratioClass(aspectRatio?: string): string {
  if (!aspectRatio) return "aspect-video";
  return RATIO_CLASS[aspectRatio] ?? "aspect-video";
}

/**
 * A real HTML5 video player.
 *
 * It plays the actual media file at `src` with native controls
 * (play/pause/seek/volume/fullscreen). It never fakes playback: when there is
 * no source, or the source fails to load, it renders an honest state instead of
 * a placeholder pretending to be a video.
 */
export function VideoPlayer({
  src,
  poster,
  title,
  aspectRatio,
  className,
  emptyMessage = "No playable video was produced for this output.",
  generating = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    src ? "loading" : "idle",
  );

  // Reset the load state whenever the source changes so a new cut does not
  // inherit the previous cut's ready/error status.
  useEffect(() => {
    setStatus(src ? "loading" : "idle");
  }, [src]);

  if (!src && generating) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-terminal/60 p-6 text-center",
          ratioClass(aspectRatio),
          className,
        )}
        data-ocid="video_player.generating_state"
      >
        <Loader2
          className="size-7 animate-spin text-primary"
          aria-hidden="true"
        />
        <p className="font-display text-sm font-semibold text-foreground">
          Generating video…
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          This cut is still being produced. It will appear here automatically
          once the run finishes.
        </p>
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-terminal/60 p-6 text-center",
          ratioClass(aspectRatio),
          className,
        )}
        data-ocid="video_player.empty_state"
      >
        <VideoOff className="size-7 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-xs text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-terminal",
        ratioClass(aspectRatio),
        className,
      )}
      data-ocid="video_player.frame"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        aria-label={title}
        className="size-full object-contain"
        data-ocid="video_player.video"
        onLoadedData={() => setStatus("ready")}
        onError={() => setStatus("error")}
      >
        <track kind="captions" />
      </video>

      {status === "loading" ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-terminal/70"
          data-ocid="video_player.loading_state"
        >
          <Loader2
            className="size-6 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
      ) : null}

      {status === "error" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-terminal/90 p-6 text-center"
          data-ocid="video_player.error_state"
        >
          <AlertTriangle
            className="size-6 text-status-halted"
            aria-hidden="true"
          />
          <p className="max-w-xs text-sm text-foreground">
            This video could not be loaded. The file may have been removed from
            storage.
          </p>
        </div>
      ) : null}
    </div>
  );
}
