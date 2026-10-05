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
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the completed-generation journey on the
 * Generated Videos page, ahead of further external-generation work.
 *
 * The request intentionally changes how a generation is started and settled.
 * These tests deliberately do NOT pin the current polling cadence, the exact
 * number of provider calls, or any internal timer shape. They pin the adjacent
 * observable behavior that must keep working once generation is reworked:
 *
 *   - while an external generation is `#generating`, the page shows a
 *     generating state and no playable video;
 *   - once that generation settles to `#ready` and the provider's output has
 *     been attached as the run's media artifact, the page surfaces a real
 *     playable `<video>` sourced from that artifact without a manual reload —
 *     the settle-refetch effect is what makes the newly-attached media appear;
 *   - the chosen prompt is shown alongside the settled result.
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

/**
 * An actor whose generation record and media artifact advance together, the
 * way a real canister behaves: while `settled` is false the generation reads
 * `#generating` with no artifact; once the provider finishes, the backend
 * attaches the output and every read observes `#ready` with the artifact. The
 * page's own polling and settle-refetch drive the transition, so no manual
 * refresh is needed.
 */
function settlingActor() {
  let settled = false;

  return createMockActor({
    getRun: vi.fn(async () => completedRun),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => (settled ? readyArtifact : null)),
    listVideoModels: vi.fn(async () => MODELS),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    getVideoGeneration: vi.fn(async () =>
      settled
        ? generationRecord({
            status: VideoGenerationStatus.ready,
            finishedAt: BigInt(Date.now()) * 1_000_000n,
          })
        : generationRecord(),
    ),
    listRunPrompts: vi.fn(async () => PROMPTS),
    // The provider finishes on the first poll; the backend then attaches the
    // output and settles the generation to `#ready`.
    pollVideoGeneration: vi.fn(async () => {
      settled = true;
      return generationRecord({ status: VideoGenerationStatus.ready });
    }),
    getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
  });
}

/** An actor whose generation never settles, for the in-flight assertions. */
function inFlightActor() {
  return createMockActor({
    getRun: vi.fn(async () => completedRun),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => null),
    listVideoModels: vi.fn(async () => MODELS),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    getVideoGeneration: vi.fn(async () => generationRecord()),
    listRunPrompts: vi.fn(async () => PROMPTS),
    pollVideoGeneration: vi.fn(async () => generationRecord()),
    getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
  });
}

describe("completed generation surfaces a playable video", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("shows a generating state and no playable video while the generation is in flight", async () => {
    infra.actor = inFlightActor();

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    expect(
      await screen.findByTestId("videos.generating_state"),
    ).toBeInTheDocument();
    // No cut is playable yet: the provider has not produced an artifact.
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(
      screen.queryByTestId("videos.chosen_prompt"),
    ).not.toBeInTheDocument();
  });

  it("surfaces a real playable video once the generation settles and its artifact is attached", async () => {
    infra.actor = settlingActor();

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    // In flight first: the page is generating with no playable cut.
    expect(
      await screen.findByTestId("videos.generating_state"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("video")).toHaveLength(0);

    // The provider finishes and the backend attaches the output. The page's
    // polling and settle-refetch effect must pull the newly-attached artifact
    // on their own — no manual refresh — so the cut becomes playable.
    await waitFor(
      () => {
        expect(container.querySelectorAll("video")).toHaveLength(1);
      },
      { timeout: 5000 },
    );
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    // The generating banner clears once the generation is terminal.
    await waitFor(() => {
      expect(
        screen.queryByTestId("videos.generating_state"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the chosen prompt alongside the settled, playable result", async () => {
    infra.actor = settlingActor();

    renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.generating_state");

    const chosen = await screen.findByTestId(
      "videos.chosen_prompt",
      undefined,
      { timeout: 5000 },
    );
    expect(chosen).toHaveTextContent(/prompt #1/i);
    expect(chosen).toHaveTextContent("Visual prompt text.");
  });
});
