import type { CameoCapture, DnaRecord, MediaArtifact } from "@/backend";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAttachMediaArtifact,
  useDeleteMediaArtifact,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import { uploadVideo } from "@/lib/mediaCapture";
import { cn } from "@/lib/utils";
import {
  Clapperboard,
  Info,
  Loader2,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";

export interface VideoArtifactPanelProps {
  runId: bigint;
  /** The run's current media artifact, if any. */
  artifact?: MediaArtifact | null;
  /** Characters available to attribute the footage to. */
  characters: DnaRecord[];
  /** Cameo captures available to attribute the footage to. */
  cameos: CameoCapture[];
  /** The character already linked to the run, if any. */
  linkedCharacterId?: bigint;
  className?: string;
}

const NO_CAMEO = "none";

/**
 * Shows a run's produced video artifact and lets the operator attach their own
 * footage to it. The upload reads the file's real duration and aspect ratio and
 * persists it through platform storage, so the artifact carries values derived
 * from the media itself.
 */
export function VideoArtifactPanel({
  runId,
  artifact = null,
  characters,
  cameos,
  linkedCharacterId,
  className,
}: VideoArtifactPanelProps) {
  const attach = useAttachMediaArtifact();
  const remove = useDeleteMediaArtifact();
  const inputRef = useRef<HTMLInputElement>(null);

  const [cameoId, setCameoId] = useState<string>(NO_CAMEO);
  const [progress, setProgress] = useState<number | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const busy = progress !== null || attach.isPending;

  const handleDelete = () => {
    setErrorMessage(null);
    remove.mutate(runId, {
      onSuccess: () => setConfirmingDelete(false),
      onError: (error) => {
        setConfirmingDelete(false);
        setErrorMessage(backendErrorMessage(error));
      },
    });
  };

  const handleFile = async (file: File) => {
    setErrorMessage(null);
    setActiveName(file.name);
    setProgress(0);
    try {
      const uploaded = await uploadVideo(file, (pct) => setProgress(pct));
      await attach.mutateAsync({
        runId,
        storageUrl: uploaded.storageUrl,
        mimeType: uploaded.mimeType,
        durationSeconds: uploaded.durationSeconds,
        aspectRatio: uploaded.aspectRatio,
        cameoId: cameoId === NO_CAMEO ? undefined : BigInt(cameoId),
      });
    } catch (error) {
      setErrorMessage(backendErrorMessage(error));
    } finally {
      setProgress(null);
      setActiveName(null);
    }
  };

  const availableCameos = linkedCharacterId
    ? cameos.filter((cameo) => cameo.characterId === linkedCharacterId)
    : cameos;

  const linkedCharacterName = linkedCharacterId
    ? (characters.find((record) => record.id === linkedCharacterId)
        ?.characterName ?? `Character #${String(linkedCharacterId)}`)
    : null;

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-panel",
        className,
      )}
      data-ocid="simulation.media.section"
    >
      <header className="flex items-center gap-2">
        <Clapperboard className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
          Produced Video
        </h3>
        {artifact ? (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-status-completed">
            {artifact.status}
          </span>
        ) : null}
      </header>

      {linkedCharacterName ? (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Built from {linkedCharacterName}
        </p>
      ) : null}

      {artifact ? (
        <div className="flex flex-col gap-2">
          <VideoPlayer
            src={artifact.storageUrl}
            title={`Run #${String(runId)} produced video`}
            aspectRatio={artifact.aspectRatio}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 rounded-md text-muted-foreground hover:border-destructive/50 hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy || remove.isPending}
              data-ocid="simulation.media.delete_button"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete video
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-terminal/60 p-6 text-center"
          data-ocid="simulation.media.empty_state"
        >
          <Clapperboard
            className="size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="max-w-sm text-sm text-muted-foreground">
            No video has been attached to this run yet. Upload your own footage
            to make it this run's output.
          </p>
        </div>
      )}

      <p
        className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
        data-ocid="simulation.media.notice"
      >
        <Info
          className="mt-0.5 size-3.5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>
          This platform does not generate photorealistic cameo video with AI.
          Attach real footage you own; the pipeline adapts the script around it.
        </span>
      </p>

      <div className="flex flex-col gap-3">
        {availableCameos.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="media-cameo"
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              Attribute to cameo (optional)
            </Label>
            <Select value={cameoId} onValueChange={setCameoId} disabled={busy}>
              <SelectTrigger
                id="media-cameo"
                className="w-full bg-background"
                data-ocid="simulation.media.cameo_select"
              >
                <SelectValue placeholder="No cameo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CAMEO}>No cameo</SelectItem>
                {availableCameos.map((cameo) => (
                  <SelectItem key={String(cameo.id)} value={String(cameo.id)}>
                    Cameo #{String(cameo.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          data-ocid="simulation.media.upload_button"
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            "border-border bg-background hover:border-primary/50 hover:bg-secondary/40",
            busy && "cursor-wait opacity-70",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="font-mono text-xs text-muted-foreground">
                Uploading {activeName ?? "video"}…
              </span>
            </>
          ) : (
            <>
              <UploadCloud className="size-5 text-muted-foreground" />
              <span className="text-sm text-foreground">
                {artifact
                  ? "Replace with another video"
                  : "Upload a video file"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                MP4, WebM, or MOV
              </span>
            </>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
          data-ocid="simulation.media.file_input"
        />

        {progress !== null ? (
          <div
            className="flex flex-col gap-1.5"
            data-ocid="simulation.media.loading_state"
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Transfer</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-ocid="simulation.media.error_state"
          >
            <ShieldAlert
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            {errorMessage}
          </p>
        ) : null}
      </div>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Delete video</DialogTitle>
            <DialogDescription>
              This removes the video attached to run #{String(runId)}. The run
              and its script stay, but the video will no longer appear here.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              data-ocid="simulation.media.delete_cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={handleDelete}
              data-ocid="simulation.media.delete_confirm_button"
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Delete video
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
