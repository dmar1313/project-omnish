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
import { GenerateVideosControl } from "@/components/GenerateVideosControl";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the prompt-selection, in-flight polling, and recovery work.
 *
 * The accepted behavior this file protects:
 *   - before generating, the operator picks exactly one prompt/cut from the
 *     run's available prompts, and only that single prompt is submitted (no
 *     automatic multi-prompt fan-out);
 *   - the chosen prompt is shown alongside the resulting video;
 *   - a generation the provider reports as still processing is polled through
 *     the backend until it settles, rather than being marked no-result;
 *   - a generation already started on the provider can be recovered from the
 *     app instead of being lost;
 *   - re-running replaces the previous result.
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
  { index: 2n, agent: "continuity", content: "Continuity notes." },
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
    promptIndex: 1n,
    prompt: "Visual prompt text.",
    predictionId: "pred-123",
    error: undefined,
    ...overrides,
  };
}

describe("GenerateVideosControl prompt selection", () => {
  it("lists the run's available prompts and submits only the chosen one", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => null),
      listRunPrompts: vi.fn(async () => PROMPTS),
      startVideoGeneration: vi.fn(async () => generationRecord()),
    });
    infra.actor = actor;

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    // The picker offers every prompt the run produced.
    const picker = await screen.findByTestId("videos.generate.prompt_select");
    await waitFor(() => expect(picker).not.toBeDisabled());
    await user.click(picker);
    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByText(/Writer draft text\./),
    ).toBeInTheDocument();
    expect(
      within(listbox).getByText(/Visual prompt text\./),
    ).toBeInTheDocument();
    expect(within(listbox).getByText(/Continuity notes\./)).toBeInTheDocument();

    // Choose a non-default prompt explicitly.
    await user.click(within(listbox).getByText(/Visual prompt text\./));

    const button = screen.getByTestId("videos.generate.primary_button");
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    // Exactly one prompt is submitted, identified by its stable index — no
    // fan-out across the run's other prompts.
    await waitFor(() => {
      expect(actor.startVideoGeneration).toHaveBeenCalledTimes(1);
    });
    expect(actor.startVideoGeneration).toHaveBeenCalledWith({
      runId: 7n,
      modelId: "kwaivgi/kling-v3-video",
      promptIndex: 1n,
    });
  });

  it("shows the chosen prompt alongside the resulting video", async () => {
    infra.actor = createMockActor({
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
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const chosen = await screen.findByTestId("videos.generate.chosen_prompt");
    expect(chosen).toHaveTextContent(/prompt #1/i);
    expect(chosen).toHaveTextContent("Visual prompt text.");
  });

  it("offers a recovery action for a generation already started on the provider", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({ status: VideoGenerationStatus.no_result }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
      recoverVideoGeneration: vi.fn(async () =>
        generationRecord({ status: VideoGenerationStatus.ready }),
      ),
    });
    infra.actor = actor;

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const recover = await screen.findByTestId("videos.generate.recover_button");
    await user.click(recover);

    await waitFor(() => {
      expect(actor.recoverVideoGeneration).toHaveBeenCalledWith(7n);
    });
  });
});

describe("GeneratedVideosPage in-flight generation", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  function pageActor(
    generation: VideoGeneration | null,
    pollResult: VideoGeneration | null,
  ) {
    return createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => null),
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => generation),
      listRunPrompts: vi.fn(async () => PROMPTS),
      pollVideoGeneration: vi.fn(async () => pollResult),
      // The Generate Videos control is gated on an approved run decision.
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });
  }

  it("polls a still-processing generation through the backend instead of marking it no-result", async () => {
    const actor = pageActor(
      generationRecord({ status: VideoGenerationStatus.generating }),
      generationRecord({ status: VideoGenerationStatus.generating }),
    );
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    // The page shows the in-progress state rather than a settled result.
    expect(
      await screen.findByTestId("videos.generating_state"),
    ).toBeInTheDocument();

    // The provider is actively polled through the backend while in flight.
    await waitFor(() => {
      expect(actor.pollVideoGeneration).toHaveBeenCalledWith(7n);
    });
  });

  it("shows the chosen prompt alongside the result once the generation settles", async () => {
    // The read query is what the page renders from; the poll writes the settled
    // state, so the read query returns ready on its next fetch.
    let reads = 0;
    const actor = pageActor(
      generationRecord({ status: VideoGenerationStatus.generating }),
      generationRecord({ status: VideoGenerationStatus.ready }),
    );
    actor.getVideoGeneration = vi.fn(async () => {
      reads += 1;
      return reads === 1
        ? generationRecord({ status: VideoGenerationStatus.generating })
        : generationRecord({ status: VideoGenerationStatus.ready });
    });
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    // The chosen prompt is shown alongside the result.
    const chosen = await screen.findByTestId("videos.chosen_prompt");
    expect(chosen).toHaveTextContent(/prompt #1/i);
    expect(chosen).toHaveTextContent("Visual prompt text.");

    // The generating banner clears once the generation settles.
    await waitFor(() => {
      expect(
        screen.queryByTestId("videos.generating_state"),
      ).not.toBeInTheDocument();
    });
  });

  it("offers a page-level recovery action for an already-started generation", async () => {
    const user = userEvent.setup();
    const actor = pageActor(
      generationRecord({ status: VideoGenerationStatus.no_result }),
      null,
    );
    actor.recoverVideoGeneration = vi.fn(async () =>
      generationRecord({ status: VideoGenerationStatus.ready }),
    );
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    const recover = await screen.findByTestId("videos.recover_button");
    await user.click(recover);

    await waitFor(() => {
      expect(actor.recoverVideoGeneration).toHaveBeenCalledWith(7n);
    });
  });

  it("re-runs generation for a run and replaces the previous result", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
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
      rerunVideoGeneration: vi.fn(async () =>
        generationRecord({
          status: VideoGenerationStatus.generating,
          promptIndex: 0n,
          prompt: "Writer draft text.",
        }),
      ),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    // A prior generation exists, so the control is in re-run mode.
    const button = await screen.findByTestId("videos.generate.primary_button");
    expect(button).toHaveTextContent(/re-run generation/i);
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    await waitFor(() => {
      expect(actor.rerunVideoGeneration).toHaveBeenCalledTimes(1);
    });
    expect(actor.rerunVideoGeneration).toHaveBeenCalledWith({
      runId: 7n,
      modelId: "kwaivgi/kling-v3-video",
      promptIndex: 0n,
    });
    expect(actor.startVideoGeneration).not.toHaveBeenCalled();
  });
});
