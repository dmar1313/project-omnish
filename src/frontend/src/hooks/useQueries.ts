import type {
  AssetIngredient,
  AssetInput,
  AttachMediaInput,
  CameoCapture,
  CameoInput,
  DnaInput,
  DnaRecord,
  Id,
  MediaArtifact,
  ProductionRun,
  ReplicateTokenStatus,
  RerunVideoGenerationInput,
  Revision,
  RunInput,
  RunSummary,
  StartVideoGenerationInput,
  VideoGeneration,
  VideoModel,
  VideoPromptOption,
} from "@/backend";
import { actorFactory } from "@/hooks/useBackend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * The shared test-aware actor factory from `useBackend`. With the test-only flag
 * off it is the generated `createActor` unchanged; with it on, the actor is
 * built against the deterministic test identity so queries AND mutations reach
 * the real backend without an Internet Identity credential. Every hook must use
 * this one factory or a call would silently bypass the test identity.
 */

/** All DNA records in the registry. */
export function useDnaList() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<DnaRecord[]>({
    queryKey: ["dna"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listDna();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Establishes a new character (DNA record) in the registry. */
export function useCreateDna() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<DnaRecord, Error, DnaInput>({
    mutationFn: async (input: DnaInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createDna(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dna"] });
    },
  });
}

/** All staged asset ingredients. */
export function useAssetList() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<AssetIngredient[]>({
    queryKey: ["assets"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listAssets();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Recent production runs, newest first. */
export function useRunList() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<RunSummary[]>({
    queryKey: ["runs"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRuns();
    },
    enabled: !!actor && !isFetching,
  });
}

/** A single production run with its generated outputs. */
export function useRun(id: bigint | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<ProductionRun | null>({
    queryKey: ["run", id?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || id === null) return null;
      return actor.getRun(id);
    },
    enabled: !!actor && !isFetching && id !== null,
  });
}

/** Registers a staged asset ingredient against the backend. */
export function useCreateAsset() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<AssetIngredient, Error, AssetInput>({
    mutationFn: async (input: AssetInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createAsset(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

/** Asset ingredients linked to a single character. */
export function useAssetsForCharacter(characterId: Id | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<AssetIngredient[]>({
    queryKey: ["assets", "character", characterId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || characterId === null) return [];
      return actor.listAssetsForCharacter(characterId);
    },
    enabled: !!actor && !isFetching && characterId !== null,
  });
}

/** All cameo captures in the registry. */
export function useCameoList() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<CameoCapture[]>({
    queryKey: ["cameos"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listCameos();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Cameo captures linked to a single character. */
export function useCameosForCharacter(characterId: Id | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<CameoCapture[]>({
    queryKey: ["cameos", "character", characterId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || characterId === null) return [];
      return actor.listCameosForCharacter(characterId);
    },
    enabled: !!actor && !isFetching && characterId !== null,
  });
}

/** Records a cameo capture (front/left/right photos + voice sample). */
export function useCreateCameo() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<CameoCapture, Error, CameoInput>({
    mutationFn: async (input: CameoInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createCameo(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cameos"] });
    },
  });
}

/**
 * Starts a production run. Returns promptly with the run persisted as
 * `#running` / `videoStatus #generating`; the pipeline continues in the
 * background and settles the run to its terminal state. Callers observe
 * progress by polling `getRun` / `listSimulationLogs`.
 */
export function useStartProductionRun() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<ProductionRun, Error, RunInput>({
    mutationFn: async (input: RunInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.startProductionRun(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["costTelemetry"] });
    },
  });
}

/** The produced video artifact for a run, if one has been attached. */
export function useMediaArtifact(runId: bigint | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<MediaArtifact | null>({
    queryKey: ["mediaArtifact", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return null;
      return actor.getMediaArtifact(runId);
    },
    enabled: !!actor && !isFetching && runId !== null,
  });
}

/**
 * Attaches a produced video artifact to a run. Invalidates the run and its
 * artifact so the run detail and video pages pick up the new media.
 */
export function useAttachMediaArtifact() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<ProductionRun | null, Error, AttachMediaInput>({
    mutationFn: async (input: AttachMediaInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.attachMediaArtifact(input);
    },
    onSuccess: (_run, input) => {
      const id = input.runId.toString();
      void queryClient.invalidateQueries({ queryKey: ["run", id] });
      void queryClient.invalidateQueries({ queryKey: ["mediaArtifact", id] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

/**
 * Removes a run's produced video artifact. Invalidates the run and its
 * artifact so the run detail and video pages drop the deleted media, and the
 * runs list so any mirrored reference is refreshed.
 */
export function useDeleteMediaArtifact() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<boolean, Error, bigint>({
    mutationFn: async (runId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteMediaArtifact(runId);
    },
    onSuccess: (_removed, runId) => {
      const id = runId.toString();
      void queryClient.invalidateQueries({ queryKey: ["run", id] });
      void queryClient.invalidateQueries({ queryKey: ["mediaArtifact", id] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

/** Every revision of a run (original + each tweak), oldest first. */
export function useRunRevisions(runId: bigint | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<Revision[]>({
    queryKey: ["revisions", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return [];
      return actor.listRevisions(runId);
    },
    enabled: !!actor && !isFetching && runId !== null,
  });
}

/** The video models the backend can generate with (Kling default, Veo premium). */
export function useVideoModels() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<VideoModel[]>({
    queryKey: ["videoModels"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listVideoModels();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Whether an admin has configured a Replicate API token. */
export function useReplicateTokenStatus() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<ReplicateTokenStatus>({
    queryKey: ["replicateTokenStatus"],
    queryFn: async () => {
      if (!actor) return { configured: false };
      return actor.getReplicateTokenStatus();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Stores the admin-configured Replicate API token. */
export function useSetReplicateToken() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<ReplicateTokenStatus, Error, string>({
    mutationFn: async (token: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setReplicateToken(token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["replicateTokenStatus"],
      });
    },
  });
}

/** Clears the stored Replicate API token. */
export function useClearReplicateToken() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<ReplicateTokenStatus, Error, void>({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.clearReplicateToken();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["replicateTokenStatus"],
      });
    },
  });
}

/**
 * The selectable prompt/cut options for a run, derived from its latest
 * revision's generated assets. Each option carries a stable index, the agent
 * that produced it, and the exact prompt text. Empty before the run has
 * generated assets.
 */
export function useListRunPrompts(runId: bigint | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<VideoPromptOption[]>({
    queryKey: ["runPrompts", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return [];
      return actor.listRunPrompts(runId);
    },
    enabled: !!actor && !isFetching && runId !== null,
  });
}

/**
 * Starts video generation for an accepted run with a chosen prompt. Returns
 * promptly with the generation persisted as `#generating`; the backend
 * continues in the background and settles it to `#ready` / `#no_result` /
 * `#failed`. Callers observe progress by polling `useVideoGeneration(runId)`.
 */
export function useStartVideoGeneration() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<VideoGeneration | null, Error, StartVideoGenerationInput>({
    mutationFn: async (input: StartVideoGenerationInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.startVideoGeneration(input);
    },
    onSuccess: (_generation, input) => {
      const id = input.runId.toString();
      void queryClient.invalidateQueries({
        queryKey: ["videoGeneration", id],
      });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["run", id] });
      void queryClient.invalidateQueries({ queryKey: ["mediaArtifact", id] });
    },
  });
}

/**
 * Re-runs video generation for a run, reusing the exact prior prompt. The
 * backend resolves the stored prompt from the run, so no prompt payload is
 * required beyond the optional model and prompt-index overrides.
 */
export function useRerunVideoGeneration() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<VideoGeneration | null, Error, RerunVideoGenerationInput>({
    mutationFn: async (input: RerunVideoGenerationInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rerunVideoGeneration(input);
    },
    onSuccess: (_generation, input) => {
      const id = input.runId.toString();
      void queryClient.invalidateQueries({
        queryKey: ["videoGeneration", id],
      });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["run", id] });
      void queryClient.invalidateQueries({ queryKey: ["mediaArtifact", id] });
    },
  });
}

/** The current video generation for a run, or null before one has started. */
export function useVideoGeneration(runId: bigint | null) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<VideoGeneration | null>({
    queryKey: ["videoGeneration", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return null;
      return actor.getVideoGeneration(runId);
    },
    enabled: !!actor && !isFetching && runId !== null,
  });
}

/**
 * Polls an in-flight generation against the provider and settles it when the
 * prediction finishes. Unlike `useVideoGeneration` (a read-only query), this
 * calls the backend's `pollVideoGeneration`, which re-checks the recorded
 * prediction and writes the settled state. Used while a generation is
 * `#generating` so a still-processing provider run resolves to ready/failed
 * without a manual refresh.
 */
export function usePollVideoGeneration(runId: bigint | null, enabled: boolean) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<VideoGeneration | null>({
    queryKey: ["videoGenerationPoll", runId?.toString() ?? "none"],
    queryFn: async () => {
      if (!actor || runId === null) return null;
      return actor.pollVideoGeneration(runId);
    },
    enabled: !!actor && !isFetching && runId !== null && enabled,
  });
}

/**
 * Recovers a generation that was started but whose continuation was lost — for
 * example a generation visible on the provider dashboard but not settled in the
 * app. Re-polls the recorded prediction and settles the generation, then
 * invalidates the generation/run/artifact queries so the UI reflects the
 * recovered result.
 */
export function useRecoverVideoGeneration() {
  const { actor } = useActor(actorFactory);
  const queryClient = useQueryClient();
  return useMutation<VideoGeneration | null, Error, bigint>({
    mutationFn: async (runId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.recoverVideoGeneration(runId);
    },
    onSuccess: (_generation, runId) => {
      const id = runId.toString();
      void queryClient.invalidateQueries({
        queryKey: ["videoGeneration", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["videoGenerationPoll", id],
      });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["run", id] });
      void queryClient.invalidateQueries({ queryKey: ["mediaArtifact", id] });
    },
  });
}
