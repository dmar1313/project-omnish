import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

/** A reference image staged locally before it is persisted to the backend. */
export interface ImageDraft {
  id: string;
  file: File;
  previewUrl: string;
}

export interface ImageUploadStepProps {
  images: ImageDraft[];
  onChange: (images: ImageDraft[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Reference-image capture step.
 *
 * Files are staged locally with an object-URL thumbnail so the operator sees
 * exactly what will be linked to the character. Persistence happens once the
 * character exists, in the wizard's submit flow.
 */
export function ImageUploadStep({
  images,
  onChange,
  onBack,
  onContinue,
}: ImageUploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: ImageDraft[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      next.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (next.length > 0) onChange([...images, ...next]);
  };

  const remove = (id: string) => {
    const target = images.find((image) => image.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((image) => image.id !== id));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
          Upload reference images
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add one or more images. Each is stored through platform file storage
          and linked to the character.
        </p>
      </div>

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
          addFiles(event.dataTransfer.files);
        }}
        data-ocid="character_creation.image.dropzone"
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/10"
            : "border-border bg-background hover:border-primary/50 hover:bg-secondary/40",
        )}
      >
        <UploadCloud
          className="size-6 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-sm text-foreground">
          Drop reference images here
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          or click to browse
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
        data-ocid="character_creation.image.upload_button"
      />

      {images.length > 0 ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          data-ocid="character_creation.image.list"
        >
          {images.map((image, index) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-card"
              data-ocid={`character_creation.image.item.${index + 1}`}
            >
              <img
                src={image.previewUrl}
                alt={image.file.name}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                  {image.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(image.id)}
                  aria-label={`Remove ${image.file.name}`}
                  data-ocid={`character_creation.image.remove_button.${index + 1}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
          data-ocid="character_creation.image.empty_state"
        >
          <ImagePlus className="size-3.5 shrink-0" aria-hidden="true" />
          No images added yet. You can continue without images if you prefer.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          data-ocid="character_creation.capture_back_button"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          data-ocid="character_creation.capture_continue_button"
        >
          {images.length > 0 ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
