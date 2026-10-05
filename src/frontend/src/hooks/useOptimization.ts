import type {
  AgentKind,
  AgentVersion,
  EntropyState,
  SuperSuitPatch,
} from "@/backend";
import { actorFactory } from "@/hooks/useBackend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * The shared test-aware actor factory from `useBackend`. With the test-only flag
 * off it is the generated `createActor` unchanged; with it on, the actor is
 * built against the deterministic test identity so the optimization route
 * reaches the real backend without an Internet Identity credential. Every route
 * must use this one factory or it would silently bypass the test identity.
 */

/** All Super Suit patches, newest first (backend returns insertion order). */
export function useSuperSuitPatches() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<SuperSuitPatch[]>({
    queryKey: ["superSuitPatches"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listSuperSuitPatches();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Current version + history for a single agent. */
export function useAgentVersion(agent: AgentKind) {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<AgentVersion | null>({
    queryKey: ["agentVersion", agent],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getAgentVersion(agent);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Entropy ceiling state: recent update timestamps + max per hour. */
export function useEntropyState() {
  const { actor, isFetching } = useActor(actorFactory);
  return useQuery<EntropyState | null>({
    queryKey: ["entropyState"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getEntropyState();
    },
    enabled: !!actor && !isFetching,
  });
}

function useInvalidateOptimization() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["superSuitPatches"] });
    void queryClient.invalidateQueries({ queryKey: ["agentVersion"] });
    void queryClient.invalidateQueries({ queryKey: ["entropyState"] });
  };
}

export function useApprovePatch() {
  const { actor } = useActor(actorFactory);
  const invalidate = useInvalidateOptimization();
  return useMutation<SuperSuitPatch | null, Error, bigint>({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveSuperSuitPatch(id);
    },
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useRejectPatch() {
  const { actor } = useActor(actorFactory);
  const invalidate = useInvalidateOptimization();
  return useMutation<SuperSuitPatch | null, Error, bigint>({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectSuperSuitPatch(id);
    },
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useRunCritic() {
  const { actor } = useActor(actorFactory);
  const invalidate = useInvalidateOptimization();
  return useMutation<SuperSuitPatch | null, Error, void>({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.runCriticAgent();
    },
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useRollbackAgent() {
  const { actor } = useActor(actorFactory);
  const invalidate = useInvalidateOptimization();
  return useMutation<AgentVersion | null, Error, AgentKind>({
    mutationFn: async (agent: AgentKind) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rollbackAgentVersion(agent);
    },
    onSuccess: () => {
      invalidate();
    },
  });
}
