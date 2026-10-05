import {
  AgentKind,
  type MediaArtifact,
  MediaArtifactStatus,
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
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the "return to a previously started
 * generation" and "re-run replaces the prior result" surfaces, ahead of the
 * external video-generation work.
 *
 * The request intentionally changes how a generation is started and settled, so
 * these tests deliberately do NOT pin the exact generating presentation or the
 * start payload. They pin the adjacent observable behavior that must keep
 * working once generation is introduced:
 *
 *   - a generation that was already started and settled is surfaced when the
 *     operator returns to the run: its chosen prompt is shown and the control
 *     is in re-run mode, rather than the run reading as never generated;
 *   - a settled generation with a real artifact renders a playable cut on
 *     return, so the previously produced video is not lost;
 *   - re-running replaces the displayed prior generation with the new one: the
 *     new chosen prompt is shown and the previous prompt is gone.
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
  {
    id: "google/veo-3.1",
    name: "Veo 3.1",
    provider: "Replicate",
    premium: true,
    default: false,
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

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
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
    predictionId: "pred-123",
    error: undefined,
    ...overrides,
  };
}

/**
 * A mock whose generation read reflects the rerun write, so the page's
 * invalidated query observes the replacement the way a real canister would.
 */
function actorWithMutableGeneration(
  initial: VideoGeneration,
  replacement: VideoGeneration,
  artifact: MediaArtifact | null = null,
) {
  let generation: VideoGeneration | null = initial;
  return createMockActor({
    getRun: vi.fn(async () => completedRun),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => artifact),
    listVideoModels: vi.fn(async () => MODELS),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    getVideoGeneration: vi.fn(async () => generation),
    listRunPrompts: vi.fn(async () => PROMPTS),
    getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    rerunVideoGeneration: vi.fn(async () => {
      generation = replacement;
      return replacement;
    }),
  });
}

describe("previously started generation characterization", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("surfaces a settled generation's chosen prompt and re-run mode on return", async () => {
    infra.actor = createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => null),
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({
          status: VideoGenerationStatus.ready,
          promptIndex: 1n,
          prompt: "Visual prompt text.",
        }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });

    renderWithProviders(<GeneratedVideosPage />);

    // The previously started generation is surfaced: its chosen prompt is
    // shown, and the control offers a re-run rather than a fresh start.
    const chosen = await screen.findByTestId("videos.chosen_prompt");
    expect(chosen).toHaveTextContent(/prompt #1/i);
    expect(chosen).toHaveTextContent("Visual prompt text.");
    expect(
      screen.getByTestId("videos.generate.primary_button"),
    ).toHaveTextContent(/re-run generation/i);
  });

  it("renders the previously produced video as a playable cut on return", async () => {
    infra.actor = createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => readyArtifact),
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({
          status: VideoGenerationStatus.ready,
          promptIndex: 0n,
          prompt: "Writer draft text.",
        }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    // The prior result is not lost: its real media is playable on return.
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0]).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });
});

describe("re-run replaces the prior generation characterization", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("replaces the displayed prior generation with the new one after a re-run", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableGeneration(
      generationRecord({
        status: VideoGenerationStatus.ready,
        promptIndex: 0n,
        prompt: "Writer draft text.",
      }),
      generationRecord({
        status: VideoGenerationStatus.ready,
        promptIndex: 1n,
        prompt: "Visual prompt text.",
      }),
    );
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    // The prior generation is shown first.
    const chosen = await screen.findByTestId("videos.chosen_prompt");
    expect(chosen).toHaveTextContent("Writer draft text.");

    const button = screen.getByTestId("videos.generate.primary_button");
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    await waitFor(() => {
      expect(actor.rerunVideoGeneration).toHaveBeenCalledTimes(1);
    });

    // The new generation replaces the prior one: the chosen-prompt block now
    // reports the new prompt, not the previous one.
    await waitFor(() => {
      expect(screen.getByTestId("videos.chosen_prompt")).toHaveTextContent(
        "Visual prompt text.",
      );
    });
    expect(screen.getByTestId("videos.chosen_prompt")).not.toHaveTextContent(
      "Writer draft text.",
    );
  });
});
