import type { AssetIngredient, RunDecisionState } from "@/backend";
import { IngredientWorkbench } from "@/components/IngredientWorkbench";
import { PromptComposer } from "@/components/PromptComposer";
import { RunList } from "@/components/RunList";
import { actorFactory } from "@/hooks/useBackend";
import { usePolling } from "@/hooks/usePolling";
import {
  useDnaList,
  useRunList,
  useStartProductionRun,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import { isActiveRun } from "@/lib/status";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Activity, Radio } from "lucide-react";
import { useMemo, useState } from "react";

const POLL_INTERVAL_MS = 3000;

/**
 * The shared test-aware actor factory from `useBackend`. With the test-only flag
 * off it is the generated `createActor` unchanged; with it on, the actor is
 * built against the deterministic test identity so this route's
 * `listRunDecisions` query does not trap Unauthorized under test sign-in.
 */

export default function LiveFeedPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { actor, isFetching } = useActor(actorFactory);
  const dnaQuery = useDnaList();
  const runsQuery = useRunList();
  const startRun = useStartProductionRun();

  const [staged, setStaged] = useState<AssetIngredient[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // A prompt carried back from a halted run (via ?prompt=) prefills the
  // composer once, so the operator can revise and resubmit without retyping.
  const initialPrompt = typeof search.prompt === "string" ? search.prompt : "";

  const dna = dnaQuery.data ?? [];
  const runs = useMemo(() => {
    const list = runsQuery.data ?? [];
    return [...list].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
    );
  }, [runsQuery.data]);

  // Decision state for every run, so the feed's rows reflect the operator's
  // approve/reject decision after returning from the Simulation Inspector.
  const decisionsQuery = useQuery<Array<[bigint, RunDecisionState]>>({
    queryKey: ["runDecisions"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRunDecisions();
    },
    enabled: !!actor && !isFetching,
  });

  const decisionsByRun = useMemo(() => {
    const map = new Map<string, RunDecisionState>();
    for (const [id, state] of decisionsQuery.data ?? []) {
      map.set(id.toString(), state);
    }
    return map;
  }, [decisionsQuery.data]);

  const hasActiveRun = runs.some((run) => isActiveRun(run.status));

  // Live status streaming: poll while a run is active OR while the start-run
  // mutation is still in flight. The backend persists #running before the
  // (slow, synchronous) call resolves, so polling must begin as soon as the
  // run is submitted — otherwise the #running state and incrementally written
  // stage logs are never observed.
  const isStreaming = hasActiveRun || startRun.isPending;
  usePolling(
    () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    { intervalMs: POLL_INTERVAL_MS, enabled: isStreaming },
  );

  const handleStaged = (asset: AssetIngredient) => {
    setStaged((current) => {
      if (current.some((item) => item.id === asset.id)) return current;
      return [...current, asset];
    });
  };

  const handleUnstage = (id: bigint) => {
    setStaged((current) => current.filter((item) => item.id !== id));
  };

  const handleSubmit = (input: {
    rawInput: string;
    characterId: bigint | null;
    assetIngredientIds: bigint[];
  }) => {
    setSubmitError(null);
    startRun.mutate(
      {
        rawInput: input.rawInput,
        characterId: input.characterId ?? undefined,
        assetIngredientIds: input.assetIngredientIds,
      },
      {
        onSuccess: (run) => {
          setStaged([]);
          // Land the operator directly on the run's results view so the
          // process visibly begins; the feed stays reachable via navigation.
          void navigate({
            to: "/simulation",
            search: { runId: run.id.toString() },
          });
        },
        onError: (error) => {
          setSubmitError(backendErrorMessage(error));
        },
      },
    );
    // Kick off an immediate refetch so the persisted #running row is observed
    // without waiting for the first polling tick.
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
  };

  return (
    <div
      className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6"
      data-ocid="feed.page"
    >
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <Activity className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Live Production Feed
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose a prompt, stage reference ingredients, and execute the
            multi-agent production pipeline.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <Radio
            className={
              isStreaming
                ? "size-3.5 text-status-running animate-live-blink"
                : "size-3.5 text-muted-foreground"
            }
            aria-hidden="true"
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {isStreaming ? "Streaming live" : "Idle"}
          </span>
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PromptComposer
            dna={dna}
            staged={staged}
            isSubmitting={startRun.isPending}
            errorMessage={submitError}
            initialPrompt={initialPrompt}
            onSubmit={handleSubmit}
            onUnstage={handleUnstage}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <IngredientWorkbench dna={dna} onStaged={handleStaged} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <RunList
            runs={runs}
            dna={dna}
            isLoading={runsQuery.isLoading}
            isError={runsQuery.isError}
            decisions={decisionsByRun}
          />
        </div>
      </div>
    </div>
  );
}
