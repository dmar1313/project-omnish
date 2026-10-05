import type { Id, LoreInput, LoreRule } from "@/backend";
import { LoreStatus } from "@/backend";
import { LoreForm } from "@/components/LoreForm";
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
import { formatTimestamp, loreStatusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; record: LoreRule };

type StatusFilter = "all" | LoreStatus;

export default function LorePage() {
  const { actor, isReady } = useBackend();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<LoreRule | null>(null);

  const loreQuery = useQuery({
    queryKey: ["lore"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listLore();
    },
    enabled: isReady,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lore"] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: LoreInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createLore(input);
    },
    onSuccess: () => {
      invalidate();
      setEditor({ mode: "closed" });
      toast.success("Lore rule created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: Id; input: LoreInput }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateLore(id, input);
    },
    onSuccess: () => {
      invalidate();
      setEditor({ mode: "closed" });
      toast.success("Lore rule updated");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: Id; status: LoreStatus }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setLoreStatus(id, status);
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(
        variables.status === LoreStatus.active
          ? "Rule reactivated"
          : "Rule deprecated",
      );
    },
    onError: (error) => {
      toast.error(backendErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: Id) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteLore(id);
    },
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
      toast.success("Lore rule deleted");
    },
    onError: (error) => {
      toast.error(backendErrorMessage(error));
    },
  });

  const rules = loreQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rules.filter((rule) => {
      const matchesStatus =
        statusFilter === "all" || rule.status === statusFilter;
      const matchesTerm =
        term === "" || rule.ruleName.toLowerCase().includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [rules, search, statusFilter]);

  const formError = createMutation.error ?? updateMutation.error ?? null;

  const handleSubmit = (input: LoreInput) => {
    if (editor.mode === "edit") {
      updateMutation.mutate({ id: editor.record.id, input });
    } else {
      createMutation.mutate(input);
    }
  };

  const filters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: LoreStatus.active, label: "Active" },
    { value: LoreStatus.deprecated, label: "Deprecated" },
  ];

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid="lore.page"
    >
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <ScrollText className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            World Lore
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Universe bounds, timeline constraints, and continuity rules.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          data-ocid="lore.create_button"
        >
          <Plus className="size-4" aria-hidden="true" />
          New rule
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
            placeholder="Search by rule name…"
            className="pl-9"
            aria-label="Search lore rules"
            data-ocid="lore.search_input"
          />
        </div>
        <fieldset
          className="flex items-center gap-1 rounded-md border border-border bg-card p-1"
          aria-label="Filter by status"
        >
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={statusFilter === filter.value}
              data-ocid={`lore.filter.${filter.value}.tab`}
              className={cn(
                "rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                statusFilter === filter.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </fieldset>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} / {rules.length} rules
        </span>
      </div>

      {loreQuery.isLoading ? (
        <div
          className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-card"
          data-ocid="lore.loading_state"
        >
          <Loader2
            className="size-5 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
      ) : loreQuery.isError ? (
        <div
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-card px-6 text-center"
          data-ocid="lore.error_state"
        >
          <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {backendErrorMessage(loreQuery.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loreQuery.refetch()}
            data-ocid="lore.retry_button"
          >
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 text-center"
          data-ocid="lore.empty_state"
        >
          <ScrollText
            className="size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              {rules.length === 0
                ? "No lore rules yet"
                : "No rules match this filter"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {rules.length === 0
                ? "Define the universe bounds and timeline constraints the pipeline must respect."
                : "Adjust the search or status filter."}
            </p>
          </div>
          {rules.length === 0 ? (
            <Button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              data-ocid="lore.empty_create_button"
            >
              <Plus className="size-4" aria-hidden="true" />
              New rule
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((rule, index) => {
            const meta = loreStatusMeta(rule.status);
            const isActive = rule.status === LoreStatus.active;
            const isToggling =
              statusMutation.isPending &&
              statusMutation.variables?.id === rule.id;

            return (
              <article
                key={String(rule.id)}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
                data-ocid={`lore.item.${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-foreground">
                      {rule.ruleName}
                    </h2>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      ID #{String(rule.id)} · {formatTimestamp(rule.createdAt)}
                    </p>
                  </div>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </div>

                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Timeline constraints
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {rule.timelineConstraints}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Universe bounds
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {rule.universeBounds}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      statusMutation.mutate({
                        id: rule.id,
                        status: isActive
                          ? LoreStatus.deprecated
                          : LoreStatus.active,
                      })
                    }
                    disabled={isToggling}
                    data-ocid={`lore.status_toggle.${index + 1}`}
                  >
                    {isToggling ? (
                      <Loader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : isActive ? (
                      <Archive className="size-3.5" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                    )}
                    {isActive ? "Deprecate" : "Reactivate"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditor({ mode: "edit", record: rule })}
                    data-ocid={`lore.edit_button.${index + 1}`}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(rule)}
                    data-ocid={`lore.delete_button.${index + 1}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </article>
            );
          })}
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
              {editor.mode === "edit" ? "Edit lore rule" : "New lore rule"}
            </DialogTitle>
            <DialogDescription>
              {editor.mode === "edit"
                ? "Update the rule's timeline constraints and universe bounds."
                : "Scope a continuity rule to a place and a time."}
            </DialogDescription>
          </DialogHeader>
          <LoreForm
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
            <DialogTitle className="font-display">Delete lore rule</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-foreground">
                {pendingDelete?.ruleName}
              </span>
              . This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              data-ocid="lore.delete_cancel_button"
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
              data-ocid="lore.delete_confirm_button"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Delete rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
