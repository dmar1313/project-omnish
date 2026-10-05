import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  RunStatus,
  type RunSummary,
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
 * Cover for the external video-generation feature.
 *
 * The accepted behavior: an accepted run can be sent to Replicate with a model
 * choice (Kling 3.0 default, Veo 3.1 premium), the action is blocked with a
 * clear explanation when no admin token is configured, triggering generation
 * flips the run into a visible Generating state with a spinner, status label,
 * and elapsed time, and the Generated Videos landing (nothing selected) lists
 * recent runs with their prompts and a Generate/Re-run action that reuses the
 * exact prior prompts.
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

const runSummary: RunSummary = {
  id: 7n,
  status: RunStatus.completed,
  tokenCostBurn: completedRun.tokenCostBurn,
  timestamp: completedRun.timestamp,
  characterId: 3n,
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

describe("GenerateVideosControl", () => {
  it("renders nothing before the run is accepted", () => {
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted={false} />);

    expect(
      screen.queryByTestId("videos.generate.section"),
    ).not.toBeInTheDocument();
  });

  it("preselects Kling 3.0 and offers Veo 3.1 as a premium option", async () => {
    const user = userEvent.setup();
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => null),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const trigger = await screen.findByTestId("videos.generate.model_select");
    // The backend's default model is preselected.
    await waitFor(() => {
      expect(trigger).toHaveTextContent("Kling 3.0");
    });

    // Opening the picker reveals both models, with Veo marked premium.
    await user.click(trigger);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText(/Kling 3\.0/)).toBeInTheDocument();
    expect(within(listbox).getByText(/Veo 3\.1/)).toBeInTheDocument();
    expect(within(listbox).getByText(/Premium/)).toBeInTheDocument();
  });

  it("explains that a generator key is required when no token is configured", async () => {
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: false })),
      getVideoGeneration: vi.fn(async () => null),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const missing = await screen.findByTestId(
      "videos.generate.token_missing_state",
    );
    expect(missing).toHaveTextContent(/generator key is required/i);
    expect(missing).toHaveTextContent(/Replicate/i);
    // The Generate action is disabled rather than silently doing nothing.
    expect(screen.getByTestId("videos.generate.primary_button")).toBeDisabled();
    // A clear path to configure the token is offered.
    expect(
      screen.getByTestId("videos.generate.settings_link"),
    ).toBeInTheDocument();
  });

  it("starts generation with the selected model and chosen prompt", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => null),
      listRunPrompts: vi.fn(async () => PROMPTS),
      startVideoGeneration: vi.fn(async () => generatingRecord()),
    });
    infra.actor = actor;

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const button = await screen.findByTestId("videos.generate.primary_button");
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    await waitFor(() => {
      expect(actor.startVideoGeneration).toHaveBeenCalledWith({
        runId: 7n,
        modelId: "kwaivgi/kling-v3-video",
        promptIndex: 0n,
      });
    });
  });

  it("shows a spinner, status label, and elapsed time while generating", async () => {
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => generatingRecord()),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const loading = await screen.findByTestId("videos.generate.loading_state");
    expect(loading).toHaveTextContent(/generating video/i);
    // The elapsed time is rendered as m:ss.
    expect(screen.getByTestId("videos.generate.elapsed")).toHaveTextContent(
      /^\d+:\d{2}$/,
    );
    // The Generate action is disabled while a generation is in flight.
    expect(screen.getByTestId("videos.generate.primary_button")).toBeDisabled();
  });

  it("surfaces a failed generation with its error message", async () => {
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generatingRecord({
          status: VideoGenerationStatus.failed,
          error: "Replicate request failed",
        }),
      ),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    const error = await screen.findByTestId("videos.generate.error_state");
    expect(error).toHaveTextContent(/generation failed/i);
    expect(error).toHaveTextContent("Replicate request failed");
  });

  it("re-runs generation through the rerun mutation in rerun mode", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generatingRecord({ status: VideoGenerationStatus.no_result }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
      rerunVideoGeneration: vi.fn(async () => generatingRecord()),
    });
    infra.actor = actor;

    renderWithProviders(
      <GenerateVideosControl runId={7n} accepted mode="rerun" />,
    );

    const button = await screen.findByTestId("videos.generate.primary_button");
    expect(button).toHaveTextContent(/re-run generation/i);
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    await waitFor(() => {
      expect(actor.rerunVideoGeneration).toHaveBeenCalledWith({
        runId: 7n,
        modelId: "kwaivgi/kling-v3-video",
        promptIndex: 0n,
      });
    });
    expect(actor.startVideoGeneration).not.toHaveBeenCalled();
  });
});

describe("GeneratedVideosPage recent runs", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
  });

  it("lists recent runs with their prompts and a re-run action when nothing is selected", async () => {
    infra.actor = createMockActor({
      listRuns: vi.fn(async () => [runSummary]),
      listRevisions: vi.fn(async () => [originalRevision]),
      getVideoGeneration: vi.fn(async () => null),
      // Generation is only offered for an approved run, so the recent-run
      // re-run action requires the run's decision to be approved.
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });

    renderWithProviders(<GeneratedVideosPage />);

    const list = await screen.findByTestId("videos.recent.list");
    expect(within(list).getByText("Run #7")).toBeInTheDocument();
    // The prompt is read from the run's latest revision.
    await waitFor(() => {
      expect(screen.getByTestId("videos.recent.prompt.1")).toHaveTextContent(
        "Visual prompt text.",
      );
    });
    expect(
      await screen.findByTestId("videos.recent.rerun_button.1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("videos.recent.open_button.1"),
    ).toBeInTheDocument();
  });

  it("never presents a blank dead end when no runs exist", async () => {
    infra.actor = createMockActor({
      listRuns: vi.fn(async () => []),
    });

    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    expect(screen.getByTestId("videos.start_run_button")).toBeInTheDocument();
  });

  it("re-runs generation in place from a recent run, reusing its prior prompts", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      listRuns: vi.fn(async () => [runSummary]),
      listRevisions: vi.fn(async () => [originalRevision]),
      getVideoGeneration: vi.fn(async () => null),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
      startVideoGeneration: vi.fn(async () => generatingRecord()),
    });
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    // The re-run action is a button that starts generation in place, reusing
    // the run's exact prior prompts rather than navigating away.
    const rerun = await screen.findByTestId("videos.recent.rerun_button.1");
    expect(rerun).toHaveTextContent(/re-run/i);
    expect(rerun).not.toHaveAttribute("href");

    await waitFor(() => expect(rerun).not.toBeDisabled());
    await user.click(rerun);

    await waitFor(() => {
      expect(actor.startVideoGeneration).toHaveBeenCalledWith({ runId: 7n });
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("shows a generating indicator on a recent run whose generation is in flight", async () => {
    infra.actor = createMockActor({
      listRuns: vi.fn(async () => [runSummary]),
      listRevisions: vi.fn(async () => [originalRevision]),
      getVideoGeneration: vi.fn(async () => generatingRecord()),
    });

    renderWithProviders(<GeneratedVideosPage />);

    expect(
      await screen.findByTestId("videos.recent.generating_state.1"),
    ).toHaveTextContent(/generating/i);
  });
});

describe("GeneratedVideosPage selected-run generating state", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  function selectedRunActor(generation: VideoGeneration | null) {
    return createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => null),
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => generation),
      listRunPrompts: vi.fn(async () => PROMPTS),
      // The Generate Videos control is gated on an approved run decision, so
      // the page only exposes it once the run is accepted.
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });
  }

  it("shows a page-level Generating state with a live elapsed timer while the generation runs", async () => {
    infra.actor = selectedRunActor(generatingRecord());

    renderWithProviders(<GeneratedVideosPage />);

    const banner = await screen.findByTestId("videos.generating_state");
    expect(banner).toHaveTextContent(/generating video/i);
    expect(screen.getByTestId("videos.generating_elapsed")).toHaveTextContent(
      /^\d+:\d{2}$/,
    );
  });

  it("clears the Generating state once the generation fails", async () => {
    infra.actor = selectedRunActor(
      generatingRecord({
        status: VideoGenerationStatus.failed,
        error: "Replicate request failed",
      }),
    );

    renderWithProviders(<GeneratedVideosPage />);

    // The run detail is rendered, so the page has loaded.
    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByTestId("videos.generating_state"),
      ).not.toBeInTheDocument();
    });
    // The failure is surfaced by the per-run control rather than a stuck spinner.
    expect(
      await screen.findByTestId("videos.generate.error_state"),
    ).toHaveTextContent("Replicate request failed");
  });
});
