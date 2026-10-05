import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  RunStatus,
  type VideoGeneration,
  VideoGenerationStatus,
  type VideoModel,
  VideoOutputStatus,
  type VideoPromptOption,
} from "@/backend";
import { GenerateVideosControl } from "@/components/GenerateVideosControl";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the terminal-state guarantees of the diagnostic-first fix round.
 *
 * The accepted behavior this file protects:
 *   - when no Replicate API token is configured, the backend persists the
 *     generation directly as `#failed` with the explicit reason
 *     "No Replicate API token configured" and returns it immediately. The UI
 *     must surface that explicit failure — never a hang, never a silent
 *     no-op, never a spinner that never resolves;
 *   - a generation that is still `#generating` must render as an in-progress
 *     state, never as a terminal no-result or ready result, so a started
 *     generation is never reported as finished before it is.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * video methods; it cannot reach the no-token start path because that requires
 * a `#completed` run, which in turn requires live inference.
 */

const infra = vi.hoisted(() => ({
  isAuthenticated: true,
  isInitializing: false,
  actor: null as unknown,
}));

const router = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useInternetIdentity: () => ({
    isAuthenticated: infra.isAuthenticated,
    isInitializing: infra.isInitializing,
    identity: undefined,
    clear: vi.fn(),
    login: vi.fn(),
  }),
  useActor: () => ({ actor: infra.actor, isFetching: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
}));

const MODELS: VideoModel[] = [
  {
    id: "kwaivgi/kling-v3-video",
    name: "Kling 3.0",
    provider: "Replicate",
    premium: false,
    default: true,
  },
];

const PROMPTS: VideoPromptOption[] = [
  { index: 0n, agent: "writer", content: "Writer draft text." },
  { index: 1n, agent: "visual", content: "Visual prompt text." },
];

const completedRun: ProductionRun = {
  id: 7n,
  status: RunStatus.completed,
  rawInput: "Marlow crosses the Veil at dusk.",
  tokenCostBurn: 4200,
  timestamp: 1_700_000_000_000_000_000n,
  characterId: 3n,
  generatedAssets: [
    { agent: AgentKind.writer, content: "Writer draft text." },
    { agent: AgentKind.visual, content: "Visual prompt text." },
    { agent: AgentKind.continuity, content: "Continuity notes." },
  ],
  formatOutputs: [
    {
      platform: "TikTok",
      aspectRatio: "9:16",
      characterLimit: 2200n,
      content: "Short-form adaptation.",
    },
  ],
  videoStatus: VideoOutputStatus.no_result,
};

const originalRevision: Revision = {
  revisionNumber: 1n,
  generatedAssets: completedRun.generatedAssets,
  formatOutputs: completedRun.formatOutputs,
  tokenCostBurn: completedRun.tokenCostBurn,
  timestamp: completedRun.timestamp,
};

function generationRecord(
  overrides: Partial<VideoGeneration> = {},
): VideoGeneration {
  return {
    runId: 7n,
    modelId: "kwaivgi/kling-v3-video",
    status: VideoGenerationStatus.generating,
    startedAt: BigInt(Date.now() - 5_000) * 1_000_000n,
    finishedAt: undefined,
    promptIndex: 0n,
    prompt: "Writer draft text.",
    predictionId: undefined,
    error: undefined,
    ...overrides,
  };
}

describe("no-token generation reports an explicit failure", () => {
  it("surfaces the backend's no-token failure instead of hanging or staying silent", async () => {
    // The backend persists the generation as #failed with this exact reason and
    // returns it immediately when no token is configured. The control must show
    // that explicit failure rather than a spinner that never resolves.
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: false })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({
          status: VideoGenerationStatus.failed,
          error: "No Replicate API token configured",
        }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const error = await screen.findByTestId("videos.generate.error_state");
    expect(error).toHaveTextContent(/generation failed/i);
    expect(error).toHaveTextContent("No Replicate API token configured");
    // The failure is terminal: no in-progress spinner is left running.
    expect(
      screen.queryByTestId("videos.generate.loading_state"),
    ).not.toBeInTheDocument();
  });

  it("surfaces the no-token failure on the Generated Videos page too", async () => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
    infra.actor = createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => null),
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: false })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({
          status: VideoGenerationStatus.failed,
          error: "No Replicate API token configured",
        }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });

    renderWithProviders(<GeneratedVideosPage />);

    const error = await screen.findByTestId("videos.generate.error_state");
    expect(error).toHaveTextContent("No Replicate API token configured");
    // The page is not stuck in a generating state.
    await waitFor(() => {
      expect(
        screen.queryByTestId("videos.generating_state"),
      ).not.toBeInTheDocument();
    });
  });
});

describe("in-flight generation is never reported as terminal", () => {
  it("renders a generating generation as in-progress, not as a no-result or ready result", async () => {
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({ status: VideoGenerationStatus.generating }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    expect(
      await screen.findByTestId("videos.generate.loading_state"),
    ).toHaveTextContent(/generating video/i);
    // A started generation is not prematurely reported as finished.
    expect(
      screen.queryByTestId("videos.generate.no_result_state"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("videos.generate.ready_state"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("videos.generate.error_state"),
    ).not.toBeInTheDocument();
  });
});
