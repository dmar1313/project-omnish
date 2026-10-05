import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  type RunDecisionState,
  RunStatus,
  type VideoGeneration,
  VideoGenerationStatus,
  type VideoModel,
  VideoOutputStatus,
} from "@/backend";
import SimulationPage from "@/pages/SimulationPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the Simulation Inspector review step, ahead of
 * the accepted-run video-generation work.
 *
 * The request intentionally changes the accepted-run Generate Videos flow and
 * the Generating state, so these tests deliberately do NOT pin the current
 * broken behavior of that flow. They pin the adjacent behavior that must keep
 * working once generation is introduced:
 *
 *   - the Generate Videos control is gated on the run's decision: it is absent
 *     for an undecided run and for a rejected run, and present once the run is
 *     approved (the review step and the decision panel share this gate);
 *   - the review step's existing proceed controls and reasoning trail are not
 *     displaced by the media slot;
 *   - while an external generation is in flight, the review step shows a
 *     page-level Generating banner with the model name, prompt count, and a
 *     live elapsed timer, and the banner is additive to the run detail.
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

/**
 * A mock actor for the review step. `decision` is the run's decision state, and
 * `generation` is the external generation record the page polls. Both are
 * overridable so a test can pin the gate and the generating banner.
 */
function reviewActor(
  decision: RunDecisionState,
  generation: VideoGeneration | null,
) {
  return createMockActor({
    listRuns: vi.fn(async () => [
      {
        id: completedRun.id,
        status: completedRun.status,
        tokenCostBurn: completedRun.tokenCostBurn,
        timestamp: completedRun.timestamp,
        characterId: completedRun.characterId,
      },
    ]),
    getRun: vi.fn(async () => completedRun),
    listSimulationLogs: vi.fn(async () => []),
    listAssets: vi.fn(async () => []),
    listRevisions: vi.fn(async () => [originalRevision]),
    getRunDecision: vi.fn(async () => decision),
    listRunDecisions: vi.fn(async () => [[completedRun.id, decision]]),
    listVideoModels: vi.fn(async () => MODELS),
    getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
    getVideoGeneration: vi.fn(async () => generation),
  });
}

describe("review step video-generation characterization", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("does not offer Generate Videos for an undecided run", async () => {
    infra.actor = reviewActor({ decision: RunDecision.completed }, null);
    renderWithProviders(<SimulationPage />);

    // The review step is mounted with its proceed controls...
    expect(
      await screen.findByTestId("simulation.proceed.section"),
    ).toBeInTheDocument();
    // ...but generation is only offered once the run is accepted.
    expect(
      screen.queryByTestId("videos.generate.section"),
    ).not.toBeInTheDocument();
  });

  it("does not offer Generate Videos for a rejected run", async () => {
    infra.actor = reviewActor(
      { decision: RunDecision.rejected, rejectionReason: "Tone is off." },
      null,
    );
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.outcome.section"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("videos.generate.section"),
    ).not.toBeInTheDocument();
  });

  it("offers Generate Videos on the review step once the run is approved", async () => {
    infra.actor = reviewActor(
      { decision: RunDecision.approved, acceptedRevision: 1n },
      null,
    );
    renderWithProviders(<SimulationPage />);

    // The approved outcome panel and the Generate Videos control coexist: the
    // control is additive to the decision panel, not a replacement for it.
    expect(
      await screen.findByTestId("simulation.outcome.section"),
    ).toHaveTextContent(/run approved/i);
    expect(
      await screen.findByTestId("videos.generate.section"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("videos.generate.primary_button"),
    ).toBeInTheDocument();
  });

  it("keeps the reasoning trail and proceed controls alongside the media slot", async () => {
    infra.actor = reviewActor({ decision: RunDecision.completed }, null);
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.agent_outputs.section"),
    ).toBeInTheDocument();
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.accept_button")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.reject_button")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.continue_button"),
    ).toBeInTheDocument();
  });

  it("shows a page-level Generating banner with model, prompt count, and elapsed time while an external generation runs", async () => {
    infra.actor = reviewActor(
      { decision: RunDecision.approved, acceptedRevision: 1n },
      generatingRecord(),
    );
    renderWithProviders(<SimulationPage />);

    const banner = await screen.findByTestId("simulation.generating_state");
    expect(banner).toHaveTextContent(/generating video/i);
    // The banner names the model and that exactly one prompt is being generated.
    expect(banner).toHaveTextContent("kwaivgi/kling-v3-video");
    expect(banner).toHaveTextContent(/1 prompt/i);
    // The elapsed timer renders as m:ss.
    expect(
      screen.getByTestId("simulation.generating_elapsed"),
    ).toHaveTextContent(/^\d+:\d{2}$/);
  });

  it("keeps the run detail readable while the external generation banner is shown", async () => {
    infra.actor = reviewActor(
      { decision: RunDecision.approved, acceptedRevision: 1n },
      generatingRecord(),
    );
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.generating_state"),
    ).toBeInTheDocument();
    // The banner is additive: the run's reasoning trail and the Generate
    // control remain mounted underneath it.
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.getByTestId("videos.generate.section")).toBeInTheDocument();
  });

  it("does not show the external generation banner once the generation settles", async () => {
    infra.actor = reviewActor(
      { decision: RunDecision.approved, acceptedRevision: 1n },
      generatingRecord({ status: VideoGenerationStatus.ready }),
    );
    renderWithProviders(<SimulationPage />);

    // The run detail is rendered, so the page has loaded.
    expect(
      await screen.findByTestId("simulation.run_detail.card"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByTestId("simulation.generating_state"),
      ).not.toBeInTheDocument();
    });
  });
});
