import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useClearReplicateToken,
  useReplicateTokenStatus,
  useSetReplicateToken,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Admin-gated settings for the Replicate API token that powers video
 * generation. The stored token is never displayed — only whether one is
 * configured — and the input is cleared synchronously on submit so a failed
 * save restores the draft without ever echoing the secret back.
 */
export default function VideoSettingsPage() {
  const tokenQuery = useReplicateTokenStatus();
  const setToken = useSetReplicateToken();
  const clearToken = useClearReplicateToken();

  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const configured = tokenQuery.data?.configured ?? false;
  const busy = setToken.isPending || clearToken.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || busy) return;
    setErrorMessage(null);
    // Clear the draft before the mutation settles; restore it on failure only
    // if the operator has not already typed something newer.
    setDraft("");
    setToken.mutate(trimmed, {
      onSuccess: () => {
        toast.success("Replicate token saved", {
          description: "Video generation is now enabled for accepted runs.",
        });
      },
      onError: (error) => {
        setErrorMessage(backendErrorMessage(error));
        setDraft((current) => (current === "" ? trimmed : current));
      },
    });
  };

  const handleClear = () => {
    if (busy) return;
    setErrorMessage(null);
    clearToken.mutate(undefined, {
      onSuccess: () => {
        toast.success("Replicate token cleared", {
          description: "Video generation is disabled until a new key is set.",
        });
      },
      onError: (error) => setErrorMessage(backendErrorMessage(error)),
    });
  };

  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-6"
      data-ocid="settings.video.page"
    >
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Video Generation Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the external generator that produces videos for accepted
            runs.
          </p>
        </div>
      </div>

      <section
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-panel"
        data-ocid="settings.video.token.card"
      >
        <header className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">
            Replicate API token
          </h2>
          <StatusBadge
            className="ml-auto"
            label={configured ? "Configured" : "Not configured"}
            tone={configured ? "completed" : "queued"}
            data-ocid="settings.video.token.status"
          />
        </header>

        <p className="text-sm text-muted-foreground">
          Video generation runs on Replicate. The token is stored server-side
          and is never shown again after saving — only whether one is
          configured.
        </p>

        {tokenQuery.isLoading ? (
          <div
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
            data-ocid="settings.video.token.loading_state"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Checking token status…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="replicate-token"
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {configured ? "Replace token" : "API token"}
              </Label>
              <Input
                id="replicate-token"
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={busy}
                placeholder="r8_…"
                className="bg-background font-mono"
                data-ocid="settings.video.token.input"
              />
            </div>

            {errorMessage ? (
              <p
                role="alert"
                className="flex items-start gap-2 text-sm text-status-halted"
                data-ocid="settings.video.token.error_state"
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                className="gap-2 rounded-md"
                disabled={busy || draft.trim().length === 0}
                data-ocid="settings.video.token.submit_button"
              >
                {setToken.isPending ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                {configured ? "Replace token" : "Save token"}
              </Button>
              {configured ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-md text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                  onClick={handleClear}
                  disabled={busy}
                  data-ocid="settings.video.token.clear_button"
                >
                  {clearToken.isPending ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  )}
                  Clear token
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
