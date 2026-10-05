import type { backendInterface } from "@/backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";

/**
 * A typed, fully-stubbed backend actor. Every method resolves to a benign
 * default so a test only has to override the methods it exercises. This is a
 * local mock: it proves nothing about the real canister.
 */
export type MockActor = {
  [K in keyof backendInterface]: ReturnType<typeof vi.fn>;
};

export function createMockActor(
  overrides: Partial<Record<keyof backendInterface, unknown>> = {},
): MockActor {
  const base: Record<string, unknown> = {
    acceptRun: vi.fn(async () => null),
    approveSuperSuitPatch: vi.fn(async () => null),
    assignCallerUserRole: vi.fn(async () => undefined),
    attachMediaArtifact: vi.fn(async () => null),
    bumpDnaVersion: vi.fn(async () => null),
    clearReplicateToken: vi.fn(async () => ({ configured: false })),
    continueRun: vi.fn(async () => null),
    createAsset: vi.fn(async () => {
      throw new Error("createAsset not stubbed");
    }),
    createDna: vi.fn(async () => {
      throw new Error("createDna not stubbed");
    }),
    createLore: vi.fn(async () => {
      throw new Error("createLore not stubbed");
    }),
    deleteAsset: vi.fn(async () => true),
    deleteCameo: vi.fn(async () => true),
    deleteDna: vi.fn(async () => true),
    deleteLore: vi.fn(async () => true),
    execute: vi.fn(async () => ({ hasMore: false, rows: [] })),
    getAgentVersion: vi.fn(async () => null),
    getApiDoc: vi.fn(async () => ""),
    getAsset: vi.fn(async () => null),
    getCallerUserRole: vi.fn(async () => "guest"),
    getCameo: vi.fn(async () => null),
    getCostTelemetry: vi.fn(async () => ({
      averageCostPerRun: 0,
      totalRuns: 0n,
      totalTokenCostBurn: 0,
    })),
    getDna: vi.fn(async () => null),
    getEntropyState: vi.fn(async () => ({
      recentUpdateTimestamps: [],
      maxUpdatesPerHour: 3n,
    })),
    getLore: vi.fn(async () => null),
    getMediaArtifact: vi.fn(async () => null),
    getRevision: vi.fn(async () => null),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: false })),
    getRun: vi.fn(async () => null),
    getRunDecision: vi.fn(async () => null),
    getSuperSuitPatch: vi.fn(async () => null),
    getVideoGeneration: vi.fn(async () => null),
    isCallerAdmin: vi.fn(async () => false),
    listAssets: vi.fn(async () => []),
    listAssetsForCharacter: vi.fn(async () => []),
    listCameos: vi.fn(async () => []),
    listCameosForCharacter: vi.fn(async () => []),
    listDna: vi.fn(async () => []),
    listLore: vi.fn(async () => []),
    listRevisions: vi.fn(async () => []),
    listRunDecisions: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listSimulationLogs: vi.fn(async () => []),
    listSuperSuitPatches: vi.fn(async () => []),
    listVideoModels: vi.fn(async () => []),
    rejectRun: vi.fn(async () => null),
    rejectSuperSuitPatch: vi.fn(async () => null),
    rerunVideoGeneration: vi.fn(async () => null),
    rollbackAgentVersion: vi.fn(async () => null),
    runCriticAgent: vi.fn(async () => null),
    schema: vi.fn(async () => ""),
    setLoreStatus: vi.fn(async () => null),
    setReplicateToken: vi.fn(async () => ({ configured: true })),
    startProductionRun: vi.fn(async () => {
      throw new Error("startProductionRun not stubbed");
    }),
    startVideoGeneration: vi.fn(async () => null),
    submitTweak: vi.fn(async () => null),
    updateAsset: vi.fn(async () => null),
    updateCameo: vi.fn(async () => null),
    updateDna: vi.fn(async () => null),
    updateLore: vi.fn(async () => null),
  };

  for (const [key, value] of Object.entries(overrides)) {
    base[key] = value;
  }

  return base as unknown as MockActor;
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface ProviderOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...options }: ProviderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
