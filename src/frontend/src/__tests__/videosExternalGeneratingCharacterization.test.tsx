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
} from "@/backend";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the Generated Videos page while an *external*
 * generation is in flight.
 *
 * The request intentionally changes the accepted-run Generating state, so these
 * tests deliberately do NOT pin the exact page-level generating presentation.
 * They pin the adjacent behavior that must keep working once the generating
 * state is reworked:
 *
 *   - while the run's external generation record is `#generating`, the
 *     Generate Videos control on the page shows its own in-progress indicator
 *     with a live elapsed timer;
 *   - once the generation settles, the control drops its in-progress state and
 *     the page falls back to the honest no-result state for a run with no
 *     artifact.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * video methods.
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

function generatingRecord(
  overrides: Partial<VideoGeneration> = {},
): VideoGeneration {
  return {
    runId: 7n,
    modelId: "kwaivgi/kling-v3-video",
    status: VideoGenerationStatus.generating,
    startedAt: BigInt(Date.now() - 5_000) * 1_000_000n,
    finishedAt: undefined,
    promptIndex: 0n,
    prompt: "Visual prompt text.",
    predictionId: undefined,
    error: undefined,
    ...overrides,
  };
}

function pageActor(generation: VideoGeneration | null) {
  return createMockActor({
    getRun: vi.fn(async () => completedRun),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => null),
    listVideoModels: vi.fn(async () => MODELS),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    getVideoGeneration: vi.fn(async () => generation),
    // The Generate Videos control is gated on an approved run decision.
    getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
  });
}

describe("Generated Videos external-generation characterization", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("shows the Generate Videos control's in-progress indicator with a live elapsed timer", async () => {
    infra.actor = pageActor(generatingRecord());
    renderWithProviders(<GeneratedVideosPage />);

    const loading = await screen.findByTestId("videos.generate.loading_state");
    expect(loading).toHaveTextContent(/generating video/i);
    expect(screen.getByTestId("videos.generate.elapsed")).toHaveTextContent(
      /^\d+:\d{2}$/,
    );
  });

  it("drops the in-progress state once the generation settles to ready", async () => {
    infra.actor = pageActor(
      generatingRecord({ status: VideoGenerationStatus.ready }),
    );
    renderWithProviders(<GeneratedVideosPage />);

    // The run detail is rendered, so the page has loaded.
    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByTestId("videos.generate.loading_state"),
      ).not.toBeInTheDocument();
    });
    // A settled generation with no artifact is the honest no-result state.
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
  });
});
