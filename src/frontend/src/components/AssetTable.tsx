import type { AssetIngredient, AssetKind, DnaRecord, Id } from "@/backend";
import { AssetKind as AssetKindEnum } from "@/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assetKindLabel, formatTimestamp } from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  Check,
  FileAudio,
  FileImage,
  FileVideo,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

export interface AssetTableProps {
  assets: AssetIngredient[];
  characters: DnaRecord[];
  onUpdate: (id: Id, tags: string[], linkedCharacterId?: Id) => void;
  onDelete: (id: Id) => void;
  updatingId?: Id | null;
  deletingId?: Id | null;
}

const KIND_ICON: Record<AssetKind, typeof FileImage> = {
  [AssetKindEnum.image]: FileImage,
  [AssetKindEnum.video]: FileVideo,
  [AssetKindEnum.audio]: FileAudio,
};

const KIND_ACCENT: Record<AssetKind, string> = {
  [AssetKindEnum.image]: "text-chart-1",
  [AssetKindEnum.video]: "text-chart-3",
  [AssetKindEnum.audio]: "text-chart-4",
};

const UNLINKED = "__unlinked__";

/**
 * Dense ingredient table. Each row can be switched into an inline edit mode to
 * change its tags and linked character, or deleted outright.
 */
export function AssetTable({
  assets,
  characters,
  onUpdate,
  onDelete,
  updatingId,
  deletingId,
}: AssetTableProps) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [characterDraft, setCharacterDraft] = useState<string>(UNLINKED);

  const characterName = (id?: Id): string => {
    if (id === undefined) return "Unlinked";
    const match = characters.find((character) => character.id === id);
    return match ? match.characterName : `#${String(id)}`;
  };

  const beginEdit = (asset: AssetIngredient) => {
    setEditingId(asset.id);
    setTagDraft(asset.tags.join(", "));
    setCharacterDraft(
      asset.linkedCharacterId === undefined
        ? UNLINKED
        : String(asset.linkedCharacterId),
    );
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTagDraft("");
    setCharacterDraft(UNLINKED);
  };

  const commitEdit = (asset: AssetIngredient) => {
    const tags = tagDraft
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const linkedCharacterId =
      characterDraft === UNLINKED ? undefined : BigInt(characterDraft);
    onUpdate(asset.id, tags, linkedCharacterId);
    cancelEdit();
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card"
      data-ocid="assets.table"
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[26%]">Ingredient</TableHead>
            <TableHead className="w-[10%]">Type</TableHead>
            <TableHead className="w-[26%]">Tags</TableHead>
            <TableHead className="w-[18%]">Linked character</TableHead>
            <TableHead className="w-[12%]">Uploaded</TableHead>
            <TableHead className="w-[8%] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset, index) => {
            const Icon = KIND_ICON[asset.fileType] ?? FileImage;
            const isEditing = editingId === asset.id;
            const isUpdating = updatingId === asset.id;
            const isDeleting = deletingId === asset.id;

            return (
              <TableRow
                key={String(asset.id)}
                data-ocid={`assets.item.${index + 1}`}
              >
                <TableCell className="max-w-0">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary",
                        KIND_ACCENT[asset.fileType] ?? "text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {asset.fileName}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {asset.storageUrl}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {assetKindLabel(asset.fileType)}
                  </span>
                </TableCell>

                <TableCell>
                  {isEditing ? (
                    <Input
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      placeholder="comma, separated, tags"
                      className="h-8"
                      aria-label="Tags"
                      data-ocid={`assets.tags.input.${index + 1}`}
                    />
                  ) : asset.tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No tags
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {asset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  {isEditing ? (
                    <Select
                      value={characterDraft}
                      onValueChange={setCharacterDraft}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-full"
                        aria-label="Linked character"
                        data-ocid={`assets.character.select.${index + 1}`}
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
                  ) : (
                    <span
                      className={cn(
                        "text-sm",
                        asset.linkedCharacterId === undefined
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {characterName(asset.linkedCharacterId)}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatTimestamp(asset.createdAt)}
                  </span>
                </TableCell>

                <TableCell className="text-right">
                  {isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => commitEdit(asset)}
                        disabled={isUpdating}
                        aria-label={`Save ${asset.fileName}`}
                        data-ocid={`assets.save_button.${index + 1}`}
                      >
                        {isUpdating ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={cancelEdit}
                        aria-label={`Cancel editing ${asset.fileName}`}
                        data-ocid={`assets.cancel_button.${index + 1}`}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => beginEdit(asset)}
                        aria-label={`Edit ${asset.fileName}`}
                        data-ocid={`assets.edit_button.${index + 1}`}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(asset.id)}
                        disabled={isDeleting}
                        aria-label={`Delete ${asset.fileName}`}
                        data-ocid={`assets.delete_button.${index + 1}`}
                      >
                        {isDeleting ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
