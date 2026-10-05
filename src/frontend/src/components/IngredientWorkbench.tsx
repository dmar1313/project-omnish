import type {
  AssetIngredient,
  AssetKind,
  DnaInput,
  DnaRecord,
} from "@/backend";
import { AssetKind as AssetKindEnum } from "@/backend";
import { DnaForm } from "@/components/DnaForm";
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
import { useCreateAsset, useCreateDna } from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import { cn } from "@/lib/utils";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  FileAudio,
  FileVideo,
  ImageIcon,
  Link2,
  Loader2,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import { useRef, useState } from "react";

export interface IngredientWorkbenchProps {
  dna: DnaRecord[];
  onStaged: (asset: AssetIngredient) => void;
}

const NO_CHARACTER = "none";

function kindFromFile(file: File): AssetKind {
  if (file.type.startsWith("video/")) return AssetKindEnum.video;
  if (file.type.startsWith("audio/")) return AssetKindEnum.audio;
  return AssetKindEnum.image;
}

function KindIcon({ kind }: { kind: AssetKind }) {
  if (kind === AssetKindEnum.video) return <FileVideo className="size-4" />;
  if (kind === AssetKindEnum.audio) return <FileAudio className="size-4" />;
  return <ImageIcon className="size-4" />;
}

export function IngredientWorkbench({
  dna,
  onStaged,
}: IngredientWorkbenchProps) {
  const createAsset = useCreateAsset();
  const createDna = useCreateDna();
  const inputRef = useRef<HTMLInputElement>(null);

  const [characterId, setCharacterId] = useState<string>(NO_CHARACTER);
  const [tags, setTags] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCharacterDialogOpen, setIsCharacterDialogOpen] = useState(false);

  const busy = progress !== null;
  const hasCharacters = dna.length > 0;

  const upload = async (file: File) => {
    setErrorMessage(null);
    setActiveName(file.name);
    setProgress(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const blob = ExternalBlob.fromBytes(
        bytes,
        file.type,
        file.name,
      ).withUploadProgress((pct) => setProgress(pct));

      const storageUrl = blob.getDirectURL();
      const parsedTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const asset = await createAsset.mutateAsync({
        fileName: file.name,
        fileType: kindFromFile(file),
        storageUrl,
        tags: parsedTags,
        linkedCharacterId:
          characterId === NO_CHARACTER ? undefined : BigInt(characterId),
      });

      onStaged(asset);
      setTags("");
    } catch (error) {
      setErrorMessage(backendErrorMessage(error));
    } finally {
      setProgress(null);
      setActiveName(null);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  const handleCreateCharacter = (input: DnaInput) => {
    createDna.mutate(input, {
      onSuccess: (record) => {
        setCharacterId(record.id.toString());
        setIsCharacterDialogOpen(false);
      },
    });
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-panel"
      data-ocid="feed.workbench.panel"
    >
      <div className="flex items-center gap-2">
        <UploadCloud className="size-4 text-primary" />
        <h2 className="font-display text-sm font-semibold tracking-tight">
          Ingredient Workbench
        </h2>
      </div>

      <p
        className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
        data-ocid="feed.workbench.explanation"
      >
        <Link2
          className="mt-0.5 size-3.5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>
          An ingredient is a raw asset — image, video, or audio — that you
          attach to a character. Linking it to a character lets that character
          use the asset during production.
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="workbench-character"
            className="text-xs text-muted-foreground"
          >
            Link to character
          </Label>
          {hasCharacters ? (
            <Select
              value={characterId}
              onValueChange={setCharacterId}
              disabled={busy}
            >
              <SelectTrigger
                id="workbench-character"
                data-ocid="feed.workbench.select"
                className="w-full bg-background"
              >
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHARACTER}>Unassigned</SelectItem>
                {dna.map((record) => (
                  <SelectItem
                    key={record.id.toString()}
                    value={record.id.toString()}
                  >
                    {record.characterName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div
              className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-3"
              data-ocid="feed.workbench.empty_state"
            >
              <p className="text-xs text-muted-foreground">
                No characters yet. Establish one to link ingredients to it.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsCharacterDialogOpen(true)}
                data-ocid="feed.workbench.empty_create_button"
              >
                <UserPlus className="size-3.5" aria-hidden="true" />
                Establish a character
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="workbench-tags"
            className="text-xs text-muted-foreground"
          >
            Tags (comma separated)
          </Label>
          <input
            id="workbench-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            disabled={busy}
            placeholder="reference, lighting, costume"
            data-ocid="feed.workbench.input"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          />
        </div>
      </div>

      {hasCharacters ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsCharacterDialogOpen(true)}
          disabled={busy}
          className="self-start"
          data-ocid="feed.workbench.create_character_button"
        >
          <UserPlus className="size-3.5" aria-hidden="true" />
          Establish a character
        </Button>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        disabled={busy}
        data-ocid="feed.workbench.dropzone"
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/10"
            : "border-border bg-background hover:border-primary/50 hover:bg-secondary/40",
          busy && "cursor-wait opacity-70",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="font-mono text-xs text-muted-foreground">
              Uploading {activeName ?? "file"}…
            </span>
          </>
        ) : (
          <>
            <UploadCloud className="size-6 text-muted-foreground" />
            <span className="text-sm text-foreground">
              Drop a reference image, video, or audio file
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              or click to browse
            </span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
        data-ocid="feed.workbench.upload_button"
      />

      {progress !== null ? (
        <div
          className="flex flex-col gap-1.5"
          data-ocid="feed.workbench.loading_state"
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
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-ocid="feed.workbench.error_state"
        >
          {errorMessage}
        </p>
      ) : null}

      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <KindIcon kind={AssetKindEnum.image} />
        Images · Video · Audio — stored off-chain, referenced on-chain
      </p>

      <Dialog
        open={isCharacterDialogOpen}
        onOpenChange={(open) => {
          setIsCharacterDialogOpen(open);
          if (!open) createDna.reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              Establish a character
            </DialogTitle>
            <DialogDescription>
              Register a character with its protected continuity anchors, then
              link ingredients to it.
            </DialogDescription>
          </DialogHeader>
          <DnaForm
            key="workbench-create"
            onSubmit={handleCreateCharacter}
            onCancel={() => setIsCharacterDialogOpen(false)}
            isPending={createDna.isPending}
            errorMessage={
              createDna.error ? backendErrorMessage(createDna.error) : null
            }
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
