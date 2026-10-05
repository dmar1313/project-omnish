import type { LoreInput, LoreRule } from "@/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import { type FormEvent, useState } from "react";

export interface LoreFormProps {
  /** Existing rule when editing; omit to create a new rule. */
  record?: LoreRule;
  onSubmit: (input: LoreInput) => void;
  onCancel: () => void;
  isPending: boolean;
  errorMessage?: string | null;
}

interface LoreDraft {
  ruleName: string;
  timelineConstraints: string;
  universeBounds: string;
}

function draftFromRecord(record?: LoreRule): LoreDraft {
  return {
    ruleName: record?.ruleName ?? "",
    timelineConstraints: record?.timelineConstraints ?? "",
    universeBounds: record?.universeBounds ?? "",
  };
}

/**
 * Create/edit form for a world-lore rule. Timeline constraints and universe
 * bounds are required so every rule is scoped to a place and a time.
 */
export function LoreForm({
  record,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: LoreFormProps) {
  const [draft, setDraft] = useState<LoreDraft>(() => draftFromRecord(record));
  const [touched, setTouched] = useState(false);

  const nameError = draft.ruleName.trim() === "";
  const timelineError = draft.timelineConstraints.trim() === "";
  const boundsError = draft.universeBounds.trim() === "";
  const hasError = nameError || timelineError || boundsError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (hasError) return;
    onSubmit({
      ruleName: draft.ruleName.trim(),
      timelineConstraints: draft.timelineConstraints.trim(),
      universeBounds: draft.universeBounds.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      data-ocid="lore.form"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="lore-rule-name"
          className="text-xs uppercase tracking-wider"
        >
          Rule name <span className="text-primary">*</span>
        </Label>
        <Input
          id="lore-rule-name"
          value={draft.ruleName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              ruleName: event.target.value,
            }))
          }
          placeholder="e.g. No FTL inside the Veil"
          autoComplete="off"
          aria-invalid={touched && nameError}
          data-ocid="lore.name.input"
        />
        {touched && nameError ? (
          <p
            className="text-xs text-destructive"
            data-ocid="lore.name.error_state"
          >
            A rule name is required.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="lore-timeline"
          className="text-xs uppercase tracking-wider"
        >
          Timeline constraints <span className="text-primary">*</span>
        </Label>
        <Textarea
          id="lore-timeline"
          value={draft.timelineConstraints}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              timelineConstraints: event.target.value,
            }))
          }
          placeholder="When this rule applies: era, sequence, causal ordering…"
          rows={3}
          aria-invalid={touched && timelineError}
          data-ocid="lore.timeline.textarea"
        />
        {touched && timelineError ? (
          <p
            className="text-xs text-destructive"
            data-ocid="lore.timeline.error_state"
          >
            Timeline constraints are required.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="lore-bounds"
          className="text-xs uppercase tracking-wider"
        >
          Universe bounds <span className="text-primary">*</span>
        </Label>
        <Textarea
          id="lore-bounds"
          value={draft.universeBounds}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              universeBounds: event.target.value,
            }))
          }
          placeholder="Where this rule holds: locations, factions, physical limits…"
          rows={3}
          aria-invalid={touched && boundsError}
          data-ocid="lore.bounds.textarea"
        />
        {touched && boundsError ? (
          <p
            className="text-xs text-destructive"
            data-ocid="lore.bounds.error_state"
          >
            Universe bounds are required.
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-ocid="lore.form.error_state"
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
          data-ocid="lore.cancel_button"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          data-ocid="lore.submit_button"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {record ? "Save changes" : "Create rule"}
        </Button>
      </div>
    </form>
  );
}
