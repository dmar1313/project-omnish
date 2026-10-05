import type { AssetInput, AssetKind, Id } from "@/backend";
import { AssetKind as AssetKindEnum } from "@/backend";
import { AssetTable } from "@/components/AssetTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBackend } from "@/hooks/useBackend";
import { backendErrorMessage } from "@/lib/backendClient";
import { assetKindLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type KindFilter = "all" | AssetKind;
type CharacterFilter = "all" | "unlinked" | string;

const UNLINKED = "__unlinked__";

export default function AssetsPage() {
  const { actor, isReady } = useBackend();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [characterFilter, setCharacterFilter] =
    useState<CharacterFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const assetsQuery = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listAssets();
    },
    enabled: isReady,
  });

  const charactersQuery = useQuery({
    queryKey: ["dna"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listDna();
    },
    enabled: isReady,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: AssetInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createAsset(input);
    },
    onSuccess: () => {
      invalidate();
      setUploadOpen(false);
      toast.success("Ingredient added");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: Id;
      input: AssetInput;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateAsset(id, input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ingredient updated");
    },
    onError: (error) => {
      toast.error(backendErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: Id) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteAsset(id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ingredient deleted");
    },
    onError: (error) => {
      toast.error(backendErrorMessage(error));
    },
  });

  const assets = assetsQuery.data ?? [];
  const characters = charactersQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesKind = kindFilter === "all" || asset.fileType === kindFilter;
      const matchesTerm =
        term === "" ||
        asset.fileName.toLowerCase().includes(term) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(term));
      const matchesCharacter =
        characterFilter === "all"
          ? true
          : characterFilter === UNLINKED
            ? asset.linkedCharacterId === undefined
            : asset.linkedCharacterId !== undefined &&
              String(asset.linkedCharacterId) === characterFilter;
      return matchesKind && matchesTerm && matchesCharacter;
    });
  }, [assets, search, kindFilter, characterFilter]);

  const handleUpdate = (id: Id, tags: string[], linkedCharacterId?: Id) => {
    const asset = assets.find((item) => item.id === id);
    if (!asset) return;
    updateMutation.mutate({
      id,
      input: {
        fileName: asset.fileName,
        fileType: asset.fileType,
        storageUrl: asset.storageUrl,
        tags,
        linkedCharacterId,
      },
    });
  };

  const kindFilters: { value: KindFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: AssetKindEnum.image, label: "Image" },
    { value: AssetKindEnum.video, label: "Video" },
    { value: AssetKindEnum.audio, label: "Audio" },
  ];

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="assets.page"
    >
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <Boxes className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Assets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingredient library of image, video, and audio references.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setUploadOpen(true)}
          data-ocid="assets.upload_button"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add ingredient
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or tag…"
            className="pl-9"
            aria-label="Search ingredients"
            data-ocid="assets.search_input"
          />
        </div>

        <fieldset
          className="flex items-center gap-1 rounded-md border border-border bg-card p-1"
          aria-label="Filter by type"
        >
          {kindFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setKindFilter(filter.value)}
              aria-pressed={kindFilter === filter.value}
              data-ocid={`assets.filter.${filter.value}.tab`}
              className={cn(
                "rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                kindFilter === filter.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </fieldset>

        <Select
          value={characterFilter}
          onValueChange={(value) => setCharacterFilter(value)}
        >
          <SelectTrigger
            size="sm"
            className="w-[190px]"
            aria-label="Filter by linked character"
            data-ocid="assets.character_filter.select"
          >
            <SelectValue placeholder="All characters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All characters</SelectItem>
            <SelectItem value={UNLINKED}>Unlinked</SelectItem>
            {characters.map((character) => (
              <SelectItem
                key={String(character.id)}
                value={String(character.id)}
              >
                {character.characterName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} / {assets.length} ingredients
        </span>
      </div>

      {assetsQuery.isLoading ? (
        <div
          className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-card"
          data-ocid="assets.loading_state"
        >
          <Loader2
            className="size-5 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
      ) : assetsQuery.isError ? (
        <div
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-card px-6 text-center"
          data-ocid="assets.error_state"
        >
          <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {backendErrorMessage(assetsQuery.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void assetsQuery.refetch()}
            data-ocid="assets.retry_button"
          >
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 text-center"
          data-ocid="assets.empty_state"
        >
          <Boxes className="size-7 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              {assets.length === 0
                ? "No ingredients yet"
                : "No ingredients match these filters"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {assets.length === 0
                ? "Register image, video, or audio references the pipeline can bind to a run."
                : "Adjust the search, type, or character filter."}
            </p>
          </div>
          {assets.length === 0 ? (
            <Button
              type="button"
              onClick={() => setUploadOpen(true)}
              data-ocid="assets.empty_upload_button"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add ingredient
            </Button>
          ) : null}
        </div>
      ) : (
        <AssetTable
          assets={filtered}
          characters={characters}
          onUpdate={handleUpdate}
          onDelete={(id) => deleteMutation.mutate(id)}
          updatingId={
            updateMutation.isPending ? updateMutation.variables?.id : null
          }
          deletingId={
            deleteMutation.isPending ? deleteMutation.variables : null
          }
        />
      )}

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) createMutation.reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Add ingredient</DialogTitle>
            <DialogDescription>
              Register a reference the pipeline can bind to a production run.
            </DialogDescription>
          </DialogHeader>
          <AssetUploadForm
            characters={characters}
            onSubmit={(input) => createMutation.mutate(input)}
            onCancel={() => setUploadOpen(false)}
            isPending={createMutation.isPending}
            errorMessage={
              createMutation.error
                ? backendErrorMessage(createMutation.error)
                : null
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AssetUploadFormProps {
  characters: { id: Id; characterName: string }[];
  onSubmit: (input: AssetInput) => void;
  onCancel: () => void;
  isPending: boolean;
  errorMessage?: string | null;
}

function AssetUploadForm({
  characters,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: AssetUploadFormProps) {
  const [fileName, setFileName] = useState("");
  const [storageUrl, setStorageUrl] = useState("");
  const [fileType, setFileType] = useState<AssetKind>(AssetKindEnum.image);
  const [tags, setTags] = useState("");
  const [linkedCharacterId, setLinkedCharacterId] = useState<string>(UNLINKED);
  const [touched, setTouched] = useState(false);

  const nameError = fileName.trim() === "";
  const urlError = storageUrl.trim() === "";
  const hasError = nameError || urlError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (hasError) return;
    onSubmit({
      fileName: fileName.trim(),
      storageUrl: storageUrl.trim(),
      fileType,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      linkedCharacterId:
        linkedCharacterId === UNLINKED ? undefined : BigInt(linkedCharacterId),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      data-ocid="assets.form"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="asset-file-name"
          className="text-xs uppercase tracking-wider"
        >
          File name <span className="text-primary">*</span>
        </Label>
        <Input
          id="asset-file-name"
          value={fileName}
          onChange={(event) => setFileName(event.target.value)}
          placeholder="e.g. vessel-07-keyframe.png"
          autoComplete="off"
          aria-invalid={touched && nameError}
          data-ocid="assets.file_name.input"
        />
        {touched && nameError ? (
          <p
            className="text-xs text-destructive"
            data-ocid="assets.file_name.error_state"
          >
            A file name is required.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="asset-storage-url"
          className="text-xs uppercase tracking-wider"
        >
          Storage URL <span className="text-primary">*</span>
        </Label>
        <Input
          id="asset-storage-url"
          value={storageUrl}
          onChange={(event) => setStorageUrl(event.target.value)}
          placeholder="https://…"
          autoComplete="off"
          aria-invalid={touched && urlError}
          data-ocid="assets.storage_url.input"
        />
        {touched && urlError ? (
          <p
            className="text-xs text-destructive"
            data-ocid="assets.storage_url.error_state"
          >
            A storage URL is required.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs uppercase tracking-wider">Type</Label>
          <Select
            value={fileType}
            onValueChange={(value) => setFileType(value as AssetKind)}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Asset type"
              data-ocid="assets.type.select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AssetKindEnum.image}>
                {assetKindLabel(AssetKindEnum.image)}
              </SelectItem>
              <SelectItem value={AssetKindEnum.video}>
                {assetKindLabel(AssetKindEnum.video)}
              </SelectItem>
              <SelectItem value={AssetKindEnum.audio}>
                {assetKindLabel(AssetKindEnum.audio)}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs uppercase tracking-wider">
            Linked character
          </Label>
          <Select
            value={linkedCharacterId}
            onValueChange={setLinkedCharacterId}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Linked character"
              data-ocid="assets.linked_character.select"
            >
              <SelectValue placeholder="Unlinked" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNLINKED}>Unlinked</SelectItem>
              {characters.map((character) => (
                <SelectItem
                  key={String(character.id)}
                  value={String(character.id)}
                >
                  {character.characterName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="asset-tags"
          className="text-xs uppercase tracking-wider"
        >
          Tags
        </Label>
        <Input
          id="asset-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="comma, separated, tags"
          autoComplete="off"
          data-ocid="assets.tags.input"
        />
      </div>

      {errorMessage ? (
        <p
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-ocid="assets.form.error_state"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-ocid="assets.cancel_button"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          data-ocid="assets.submit_button"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-4" aria-hidden="true" />
          )}
          Add ingredient
        </Button>
      </div>
    </form>
  );
}
