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
import {
  GeneratedVideos,
  type VideoOutput,
  deriveVideoOutputs,
} from "@/components/GeneratedVideos";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the QA-repair branches of the external video-generation work.
 *
 * The accepted behavior this file protects:
 *   - while an external provider generation is in flight, every cut stays in
 *     its loading state instead of rendering a terminal no-result card (the
 *     backend leaves run.videoStatus at #no_result during external generation);
 *   - a generation already started on the provider is surfaced with a recovery
 *     action even while it is still #generating, so it is never lost;
 *   - the Generate Videos control is only offered for an approved run.
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
    predictionId: "pred-123",
    error: undefined,
    ...overrides,
  };
}

describe("deriveVideoOutputs external generation", () => {
  it("keeps every cut generating while an external generation is in flight", () => {
    // The run itself is terminal with no artifact, so without the external
    // flag the cuts would read as an honest no-result.
    const withoutExternal = deriveVideoOutputs(completedRun);
    expect(withoutExternal[0].videoStatus).toBe(VideoOutputStatus.no_result);

    const withExternal = deriveVideoOutputs(completedRun, null, null, true);
    expect(withExternal).toHaveLength(1);
    expect(withExternal[0].videoStatus).toBe(VideoOutputStatus.generating);
    expect(withExternal[0].mediaUrl).toBeNull();
  });

  it("lets a real artifact win over the external generating flag", () => {
    const artifact: MediaArtifact = {
      status: MediaArtifactStatus.ready,
      createdAt: 1_700_000_200_000_000_000n,
      mimeType: "video/mp4",
      durationSeconds: 42,
      storageUrl: "https://storage.example/run-7.mp4",
      aspectRatio: "9:16",
    };
    const outputs = deriveVideoOutputs(completedRun, null, artifact, true);
    expect(outputs[0].videoStatus).toBe(VideoOutputStatus.ready);
    expect(outputs[0].mediaUrl).toBe(artifact.storageUrl);
  });
});

describe("GeneratedVideosPage external generation", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  function pageActor(
    generation: VideoGeneration | null,
    decision: RunDecision = RunDecision.approved,
  ) {
    return createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => null),
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => generation),
      listRunPrompts: vi.fn(async () => PROMPTS),
      getRunDecision: vi.fn(async () => ({ decision })),
    });
  }

  it("shows a per-cut loading card while an external generation runs", async () => {
    infra.actor = pageActor(generatingRecord());

    renderWithProviders(<GeneratedVideosPage />);

    // The cut is rendered in its loading state, not as a terminal no-result.
    const loading = await screen.findByTestId("videos.generating_state.1");
    expect(loading).toHaveTextContent(/generating video/i);
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("offers recovery for a generation that is still generating", async () => {
    const user = userEvent.setup();
    const actor = pageActor(generatingRecord());
    actor.recoverVideoGeneration = vi.fn(async () =>
      generatingRecord({ status: VideoGenerationStatus.ready }),
    );
    infra.actor = actor;

    renderWithProviders(<GeneratedVideosPage />);

    const recover = await screen.findByTestId("videos.recover_button");
    await user.click(recover);

    await waitFor(() => {
      expect(actor.recoverVideoGeneration).toHaveBeenCalledWith(7n);
    });
  });

  it("hides the Generate Videos control for a run that is not approved", async () => {
    infra.actor = pageActor(null, RunDecision.completed);

    renderWithProviders(<GeneratedVideosPage />);

    // The page has loaded (the run detail is rendered)...
    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    // ...but generation is not offered until the run is approved.
    await waitFor(() => {
      expect(
        screen.queryByTestId("videos.generate.section"),
      ).not.toBeInTheDocument();
    });
  });

  it("offers the Generate Videos control once the run is approved", async () => {
    infra.actor = pageActor(null, RunDecision.approved);

    renderWithProviders(<GeneratedVideosPage />);

    expect(
      await screen.findByTestId("videos.generate.section"),
    ).toBeInTheDocument();
  });
});

describe("GeneratedVideos external generating card", () => {
  it("renders a loading card for a cut with no media that is still generating", () => {
    const video: VideoOutput = {
      id: "TikTok-0",
      title: "TikTok cut",
      platform: "TikTok",
      aspectRatio: "9:16",
      durationSeconds: 0,
      mediaUrl: null,
      videoStatus: VideoOutputStatus.generating,
      script: "Short-form adaptation.",
      continuityNotes: "Continuity notes.",
    };
    renderWithProviders(
      <GeneratedVideos videos={[video]} onSelect={vi.fn()} />,
    );

    expect(screen.getByTestId("videos.generating_state.1")).toHaveTextContent(
      /generating video/i,
    );
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });
});
