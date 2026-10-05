import type { AssetIngredient, DnaRecord } from "@/backend";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { assetKindLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Loader2, Play, Sparkles, X } from "lucide-react";
import { useState } from "react";

export interface PromptComposerProps {
  dna: DnaRecord[];
  staged: AssetIngredient[];
  isSubmitting: boolean;
  errorMessage: string | null;
  /** One-time initial draft, e.g. a prompt carried back from a halted run. */
  initialPrompt?: string;
  onSubmit: (input: {
    rawInput: string;
    characterId: bigint | null;
    assetIngredientIds: bigint[];
  }) => void;
  onUnstage: (id: bigint) => void;
}

const NO_CHARACTER = "none";

export function PromptComposer({
  dna,
  staged,
  isSubmitting,
  errorMessage,
  initialPrompt = "",
  onSubmit,
  onUnstage,
}: PromptComposerProps) {
  const [rawInput, setRawInput] = useState(initialPrompt);
  const [characterId, setCharacterId] = useState<string>(NO_CHARACTER);

  const trimmed = rawInput.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const captured = trimmed;
    setRawInput("");
    onSubmit({
      rawInput: captured,
      characterId: characterId === NO_CHARACTER ? null : BigInt(characterId),
      assetIngredientIds: staged.map((asset) => asset.id),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-panel"
      data-ocid="feed.prompt.panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-display text-sm font-semibold tracking-tight">
            Prompt Composer
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {trimmed.length} chars
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="prompt-raw" className="text-xs text-muted-foreground">
          Raw idea
        </Label>
        <Textarea
          id="prompt-raw"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="Describe the scene, beat, or sequence to produce…"
          rows={5}
          disabled={isSubmitting}
          data-ocid="feed.prompt.textarea"
          className="min-h-[120px] resize-y bg-background font-body text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="prompt-character"
            className="text-xs text-muted-foreground"
          >
            Target character
          </Label>
          <Select
            value={characterId}
            onValueChange={setCharacterId}
            disabled={isSubmitting}
          >
            <SelectTrigger
              id="prompt-character"
              data-ocid="feed.prompt.select"
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
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            Staged ingredients
          </span>
          <div
            className={cn(
              "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5",
              staged.length === 0 && "text-muted-foreground",
            )}
            data-ocid="feed.prompt.staged_list"
          >
            {staged.length === 0 ? (
              <span className="font-mono text-[11px]">
                None staged — use the workbench
              </span>
            ) : (
              staged.map((asset) => (
                <span
                  key={asset.id.toString()}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary"
                >
                  <span className="max-w-[120px] truncate">
                    {asset.fileName}
                  </span>
                  <span className="text-primary/60">
                    {assetKindLabel(asset.fileType)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnstage(asset.id)}
                    disabled={isSubmitting}
                    aria-label={`Remove ${asset.fileName}`}
                    className="rounded-sm p-0.5 hover:bg-primary/20 disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-ocid="feed.prompt.error_state"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {isSubmitting
            ? "Pipeline executing — three inference passes"
            : "Ready to execute"}
        </p>
        <Button
          type="submit"
          disabled={!canSubmit}
          data-ocid="feed.prompt.submit_button"
          className="gap-2"
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {isSubmitting ? "Running…" : "Start production run"}
        </Button>
      </div>
    </form>
  );
}
