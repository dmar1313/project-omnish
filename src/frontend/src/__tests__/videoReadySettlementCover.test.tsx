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
 * Cover for the settlement contract of an external video generation: the
 * frontend must render a playable video only when the persisted generation is
 * `#ready` *and* a real playable artifact URL is exposed, and must show the
 * honest no-result state for every other terminal outcome.
 *
 * The accepted behavior this file protects:
 *   - a generation that reaches `#ready` with a persisted, non-null playable
 *     URL renders the video for the user;
 *   - a generation that reports `#ready` but whose artifact read returns nothing
 *     must NOT render a playable video — a ready state with no video is the
 *     exact regression this guards against;
 *   - a generation whose provider output carried no usable URL settles to
 *     `#no_result` and shows the honest no-result state, never a ready video;
 *   - a `#failed` generation shows the honest no-result state and surfaces its
 *     error, never a playable video.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * media read/attach methods; the provider settlement branch itself is not
 * reachable without a live Replicate token and is recorded as a coverage limit.
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
    prompt: "Visual prompt text.",
    predictionId: "pred-123",
    error: undefined,
    ...overrides,
  };
}

/**
 * A page actor whose generation record and media artifact are fixed, so the
 * page observes exactly one settled outcome. `getMediaArtifact` is the
 * authoritative read the page falls back to `run.mediaArtifact` from; the run
 * record carries no mirror here, so a null artifact read means no playable URL.
 */
function settledActor(
  generation: VideoGeneration | null,
  artifact: MediaArtifact | null,
) {
  return createMockActor({
    getRun: vi.fn(async () => completedRun),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => artifact),
    listVideoModels: vi.fn(async () => MODELS),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    getVideoGeneration: vi.fn(async () => generation),
    listRunPrompts: vi.fn(async () => PROMPTS),
    getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
  });
}

describe("settled generation renders a video only with a playable URL", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("renders the playable video when a ready generation exposes a non-null URL", async () => {
    infra.actor = settledActor(
      generationRecord({ status: VideoGenerationStatus.ready }),
      readyArtifact,
    );

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0]).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("does not render a playable video for a ready generation with no persisted URL", async () => {
    // The exact regression: the generation reports #ready but no playable URL
    // was captured, so the page must not present a video that does not exist.
    infra.actor = settledActor(
      generationRecord({ status: VideoGenerationStatus.ready }),
      null,
    );

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
  });

  it("shows the honest no-result state for a no_result generation with no URL", async () => {
    infra.actor = settledActor(
      generationRecord({ status: VideoGenerationStatus.no_result }),
      null,
    );

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
  });

  it("shows the honest no-result state and surfaces the error for a failed generation", async () => {
    infra.actor = settledActor(
      generationRecord({
        status: VideoGenerationStatus.failed,
        error: "Replicate prediction failed",
      }),
      null,
    );

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
    // The failure reason is surfaced by the per-run control, not swallowed.
    expect(
      await screen.findByTestId("videos.generate.error_state"),
    ).toHaveTextContent("Replicate prediction failed");
  });

  it("plays the persisted URL in the detail view for a ready generation", async () => {
    const user = userEvent.setup();
    infra.actor = settledActor(
      generationRecord({ status: VideoGenerationStatus.ready }),
      readyArtifact,
    );

    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    const video = await screen.findByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("shows the honest empty player in the detail view when a ready generation has no URL", async () => {
    const user = userEvent.setup();
    infra.actor = settledActor(
      generationRecord({ status: VideoGenerationStatus.ready }),
      null,
    );

    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    await waitFor(() => {
      expect(
        screen.getByTestId("video_player.empty_state"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
  });
});
