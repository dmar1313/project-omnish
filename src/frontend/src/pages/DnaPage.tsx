import type { DnaInput, DnaRecord, Id } from "@/backend";
import { createActor } from "@/backend";
import { DnaForm } from "@/components/DnaForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBackend } from "@/hooks/useBackend";
import { backendErrorMessage } from "@/lib/backendClient";
import { formatTimestamp } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpCircle,
  Fingerprint,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; record: DnaRecord };

export default function DnaPage() {
  const { actor, isReady } = useBackend();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<DnaRecord | null>(null);

  const dnaQuery = useQuery({
    queryKey: ["dna"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listDna();
    },
    enabled: isReady,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["dna"] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: DnaInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createDna(input);
    },
    onSuccess: () => {
      invalidate();
      setEditor({ mode: "closed" });
      toast.success("DNA entry created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: Id; input: DnaInput }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateDna(id, input);
    },
    onSuccess: () => {
      invalidate();
      setEditor({ mode: "closed" });
      toast.success("DNA entry updated");
    },
  });

  const bumpMutation = useMutation({
    mutationFn: async (id: Id) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.bumpDnaVersion(id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Version bumped");
    },
    onError: (error) => {
      toast.error(backendErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: Id) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteDna(id);
    },
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
      toast.success("DNA entry deleted");
    },
    onError: (error) => {
      toast.error(backendErrorMessage(error));
    },
  });

  const records = dnaQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term === "") return records;
    return records.filter((record) =>
      record.characterName.toLowerCase().includes(term),
    );
  }, [records, search]);

  const formError = createMutation.error ?? updateMutation.error ?? null;

  const handleSubmit = (input: DnaInput) => {
    if (editor.mode === "edit") {
      updateMutation.mutate({ id: editor.record.id, input });
    } else {
      createMutation.mutate(input);
    }
  };

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="dna.page"
    >
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            DNA Registry
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Character identity blocks, immutable traits, and visual markers.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          data-ocid="dna.create_button"
        >
          <Plus className="size-4" aria-hidden="true" />
          New entry
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by character name…"
            className="pl-9"
            aria-label="Search DNA entries"
            data-ocid="dna.search_input"
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} / {records.length} entries
        </span>
      </div>

      {dnaQuery.isLoading ? (
        <div
          className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-card"
          data-ocid="dna.loading_state"
        >
          <Loader2
            className="size-5 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
      ) : dnaQuery.isError ? (
        <div
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-card px-6 text-center"
          data-ocid="dna.error_state"
        >
          <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {backendErrorMessage(dnaQuery.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void dnaQuery.refetch()}
            data-ocid="dna.retry_button"
          >
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 text-center"
          data-ocid="dna.empty_state"
        >
          <Fingerprint
            className="size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              {records.length === 0
                ? "No DNA entries yet"
                : "No entries match your search"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {records.length === 0
                ? "Register a character to anchor identity, traits, and visual markers."
                : "Try a different character name."}
            </p>
          </div>
          {records.length === 0 ? (
            <Button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              data-ocid="dna.empty_create_button"
            >
              <Plus className="size-4" aria-hidden="true" />
              New entry
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((record, index) => (
            <article
              key={String(record.id)}
              className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
              data-ocid={`dna.item.${index + 1}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-semibold text-foreground">
                    {record.characterName}
                  </h2>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    ID #{String(record.id)} ·{" "}
                    {formatTimestamp(record.createdAt)}
                  </p>
                </div>
                <StatusBadge
                  label={`v${String(record.activeVersion)}`}
                  tone="running"
                />
              </div>

              <dl className="mt-4 flex flex-col gap-3">
                <DnaField
                  label="Identity blocks"
                  value={record.identityBlocks}
                  protectedField
                />
                <DnaField
                  label="Immutable traits"
                  value={record.immutableTraits}
                  protectedField
                />
                <DnaField label="Visual markers" value={record.visualMarkers} />
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bumpMutation.mutate(record.id)}
                  disabled={
                    bumpMutation.isPending &&
                    bumpMutation.variables === record.id
                  }
                  data-ocid={`dna.bump_button.${index + 1}`}
                >
                  {bumpMutation.isPending &&
                  bumpMutation.variables === record.id ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowUpCircle className="size-3.5" aria-hidden="true" />
                  )}
                  Bump version
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor({ mode: "edit", record })}
                  data-ocid={`dna.edit_button.${index + 1}`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setPendingDelete(record)}
                  data-ocid={`dna.delete_button.${index + 1}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={editor.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) {
            setEditor({ mode: "closed" });
            createMutation.reset();
            updateMutation.reset();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editor.mode === "edit" ? "Edit DNA entry" : "New DNA entry"}
            </DialogTitle>
            <DialogDescription>
              {editor.mode === "edit"
                ? "Update the character's identity, traits, and visual markers."
                : "Register a character with its protected continuity anchors."}
            </DialogDescription>
          </DialogHeader>
          <DnaForm
            key={editor.mode === "edit" ? String(editor.record.id) : "create"}
            record={editor.mode === "edit" ? editor.record : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setEditor({ mode: "closed" })}
            isPending={createMutation.isPending || updateMutation.isPending}
            errorMessage={formError ? backendErrorMessage(formError) : null}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Delete DNA entry</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-foreground">
                {pendingDelete?.characterName}
              </span>{" "}
              and its version history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              data-ocid="dna.delete_cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                pendingDelete && deleteMutation.mutate(pendingDelete.id)
              }
              disabled={deleteMutation.isPending}
              data-ocid="dna.delete_confirm_button"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Delete entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DnaFieldProps {
  label: string;
  value: string;
  protectedField?: boolean;
}

function DnaField({ label, value, protectedField }: DnaFieldProps) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {protectedField ? (
          <Lock className="size-2.5 text-status-pending" aria-hidden="true" />
        ) : null}
      </dt>
      <dd
        className={cn(
          "mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
