import type { DnaInput, DnaRecord } from "@/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Save, ShieldAlert } from "lucide-react";
import { type FormEvent, useState } from "react";

export interface DnaFormProps {
  /** Existing record when editing; omit to create a new entry. */
  record?: DnaRecord;
  onSubmit: (input: DnaInput) => void;
  onCancel: () => void;
  isPending: boolean;
  errorMessage?: string | null;
  /**
   * Relaxes the descriptor fields (identity blocks, immutable traits, visual
   * markers) to optional. The character name is always required. Used by the
   * multi-method character creation flow, where a character may be defined by
   * reference images or a camera cameo instead of text.
   */
  optionalFields?: boolean;
  /** Overrides the primary submit label (defaults to create/save wording). */
  submitLabel?: string;
}

interface DnaDraft {
  characterName: string;
  identityBlocks: string;
  immutableTraits: string;
  visualMarkers: string;
}

function draftFromRecord(record?: DnaRecord): DnaDraft {
  return {
    characterName: record?.characterName ?? "",
    identityBlocks: record?.identityBlocks ?? "",
    immutableTraits: record?.immutableTraits ?? "",
    visualMarkers: record?.visualMarkers ?? "",
  };
}

/**
 * Create/edit form for a DNA record. Identity blocks and immutable traits are
 * flagged as protected fields so operators understand they are continuity
 * anchors rather than free-form notes.
 */
export function DnaForm({
  record,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
  optionalFields = false,
  submitLabel,
}: DnaFormProps) {
  const [draft, setDraft] = useState<DnaDraft>(() => draftFromRecord(record));
  const [touched, setTouched] = useState(false);

  const nameError = draft.characterName.trim() === "";
  const identityError = !optionalFields && draft.identityBlocks.trim() === "";
  const traitsError = !optionalFields && draft.immutableTraits.trim() === "";
  const markersError = !optionalFields && draft.visualMarkers.trim() === "";
  const hasError = nameError || identityError || traitsError || markersError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (hasError) return;
    onSubmit({
      characterName: draft.characterName.trim(),
      identityBlocks: draft.identityBlocks.trim(),
      immutableTraits: draft.immutableTraits.trim(),
      visualMarkers: draft.visualMarkers.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      data-ocid="dna.form"
      noValidate
    >
      <Field
        id="dna-character-name"
        label="Character name"
        required
        error={touched && nameError ? "A character name is required." : null}
      >
        <Input
          id="dna-character-name"
          value={draft.characterName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              characterName: event.target.value,
            }))
          }
          placeholder="e.g. Vessel-07 / Marlow Quinn"
          autoComplete="off"
          aria-invalid={touched && nameError}
          data-ocid="dna.name.input"
        />
      </Field>

      <Field
        id="dna-identity-blocks"
        label="Identity blocks"
        required={!optionalFields}
        protectedField
        hint="Core self-definition. Treated as a protected continuity anchor."
        error={
          touched && identityError ? "Identity blocks are required." : null
        }
      >
        <Textarea
          id="dna-identity-blocks"
          value={draft.identityBlocks}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              identityBlocks: event.target.value,
            }))
          }
          placeholder="Who the character is: origin, voice, motivation, relationships…"
          rows={4}
          aria-invalid={touched && identityError}
          data-ocid="dna.identity_blocks.textarea"
        />
      </Field>

      <Field
        id="dna-immutable-traits"
        label="Immutable traits"
        required={!optionalFields}
        protectedField
        hint="Traits that must never drift across versions."
        error={touched && traitsError ? "Immutable traits are required." : null}
      >
        <Textarea
          id="dna-immutable-traits"
          value={draft.immutableTraits}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              immutableTraits: event.target.value,
            }))
          }
          placeholder="Fixed physical, behavioural, or canonical facts…"
          rows={3}
          aria-invalid={touched && traitsError}
          data-ocid="dna.immutable_traits.textarea"
        />
      </Field>

      <Field
        id="dna-visual-markers"
        label="Visual markers"
        required={!optionalFields}
        hint="Prompt-ready descriptors used by the Visual agent."
        error={touched && markersError ? "Visual markers are required." : null}
      >
        <Textarea
          id="dna-visual-markers"
          value={draft.visualMarkers}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              visualMarkers: event.target.value,
            }))
          }
          placeholder="Silhouette, palette, signature props, lighting cues…"
          rows={3}
          aria-invalid={touched && markersError}
          data-ocid="dna.visual_markers.textarea"
        />
      </Field>

      {errorMessage ? (
        <p
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-ocid="dna.form.error_state"
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
          data-ocid="dna.cancel_button"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          data-ocid="dna.submit_button"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {submitLabel ?? (record ? "Save changes" : "Create entry")}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  protectedField?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}

function Field({
  id,
  label,
  required,
  protectedField,
  hint,
  error,
  children,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id} className="text-xs uppercase tracking-wider">
          {label}
          {required ? <span className="text-primary">*</span> : null}
        </Label>
        {protectedField ? (
          <span
            className="inline-flex items-center gap-1 rounded-sm border border-status-pending/40 bg-status-pending/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-status-pending"
            data-ocid={`${id}.protected_badge`}
          >
            <Lock className="size-2.5" aria-hidden="true" />
            Protected
          </span>
        ) : null}
      </div>
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p
          className={cn("text-xs text-destructive")}
          data-ocid={`${id}.error_state`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
