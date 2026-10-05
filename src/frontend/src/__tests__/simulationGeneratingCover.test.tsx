import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  type RunDecisionState,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import SimulationPage from "@/pages/SimulationPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the generating-state work on the Simulation Inspector.
 *
 * The accepted behavior: while a run is processing — either a pending/running
 * run, or a completed run whose video output the backend reports as
 * `#generating` because a tweak is regenerating a revision — the inspector
 * shows a visible generating banner. The banner must not appear for a terminal
 * run that has settled to `#no_result`.
 *
 * The request also changed the `submitTweak` contract: it now returns promptly
 * with the run's `videoStatus` set to `#generating` and always resolves `null`
 * (the new revision is appended in the background). The page must therefore NOT
 * read a `null` return as a failure — the old code did, and showed a spurious
 * "Tweak generation failed" error. This suite pins that the null return is
 * treated as success and the generating banner appears.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * run/tweak methods.
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

const baseRun: ProductionRun = {
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
  generatedAssets: baseRun.generatedAssets,
  formatOutputs: baseRun.formatOutputs,
  tokenCostBurn: baseRun.tokenCostBurn,
  timestamp: baseRun.timestamp,
};

const tweakedRevision: Revision = {
  revisionNumber: 2n,
  instruction: "Make the ending warmer.",
  generatedAssets: [
    { agent: AgentKind.writer, content: "Warmer writer draft." },
    { agent: AgentKind.visual, content: "Warmer visual prompt." },
    { agent: AgentKind.continuity, content: "Warmer continuity notes." },
  ],
  formatOutputs: [],
  tokenCostBurn: 5100,
  timestamp: 1_700_000_100_000_000_000n,
};

/**
 * A stateful mock actor whose `getRun` reflects the run's lifecycle. `submitTweak`
 * mirrors the real backend contract: it flips the run's `videoStatus` to
 * `#generating` and resolves `null` (no revision yet). `setRun` lets a test
 * advance the run to its settled state, as a later poll would observe.
 */
function actorWithMutableRun(run: ProductionRun) {
  let currentRun = run;
  let revisions: Revision[] = [originalRevision];
  const decision: RunDecisionState = { decision: RunDecision.completed };

  const actor = createMockActor({
    listRuns: vi.fn(async () => [
      {
        id: currentRun.id,
        status: currentRun.status,
        tokenCostBurn: currentRun.tokenCostBurn,
        timestamp: currentRun.timestamp,
        characterId: currentRun.characterId,
      },
    ]),
    getRun: vi.fn(async () => currentRun),
    listSimulationLogs: vi.fn(async () => []),
    listAssets: vi.fn(async () => []),
    listRevisions: vi.fn(async () => revisions),
    getRunDecision: vi.fn(async () => decision),
    listRunDecisions: vi.fn(async () => [[currentRun.id, decision]]),
    submitTweak: vi.fn(async () => {
      // The real backend returns promptly with videoStatus #generating and a
      // null revision; the new revision lands later via polling.
      currentRun = { ...currentRun, videoStatus: VideoOutputStatus.generating };
      revisions = [...revisions, tweakedRevision];
      return null;
    }),
  });

  return Object.assign(actor, {
    setRun: (next: ProductionRun) => {
      currentRun = next;
    },
  });
}

describe("SimulationPage generating state", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
    infra.actor = actorWithMutableRun(baseRun);
  });

  it("shows a generating banner for a running run", async () => {
    infra.actor = actorWithMutableRun({
      ...baseRun,
      status: RunStatus.running,
      videoStatus: VideoOutputStatus.generating,
    });
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.generating_state"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("simulation.generating_state")).toHaveTextContent(
      /still processing/i,
    );
  });

  it("shows a generating banner for a completed run whose video is regenerating", async () => {
    infra.actor = actorWithMutableRun({
      ...baseRun,
      status: RunStatus.completed,
      videoStatus: VideoOutputStatus.generating,
    });
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.generating_state"),
    ).toBeInTheDocument();
    // A completed run is not "still processing"; it is regenerating a revision.
    expect(screen.getByTestId("simulation.generating_state")).toHaveTextContent(
      /new revision is being generated/i,
    );
  });

  it("does not show the generating banner for a settled no-result run", async () => {
    renderWithProviders(<SimulationPage />);

    // The run detail is rendered, so the page has loaded.
    expect(
      await screen.findByTestId("simulation.run_detail.card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("simulation.generating_state"),
    ).not.toBeInTheDocument();
  });

  it("treats a null submitTweak return as success and shows the generating banner", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableRun(baseRun);
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    const input = await screen.findByTestId("simulation.tweak.input");
    await user.type(input, "Make the ending warmer.");
    await user.click(screen.getByTestId("simulation.tweak.submit_button"));

    await waitFor(() => {
      expect(actor.submitTweak).toHaveBeenCalledWith({
        runId: 7n,
        instruction: "Make the ending warmer.",
      });
    });

    // The null return is not a failure: no tweak error is shown, and the run's
    // videoStatus now reads #generating, so the banner appears.
    expect(
      screen.queryByTestId("simulation.tweak.error_state"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("simulation.generating_state"),
    ).toBeInTheDocument();
  });

  it("clears the generating banner once the run settles to no_result", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableRun({
      ...baseRun,
      videoStatus: VideoOutputStatus.generating,
    });
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.generating_state"),
    ).toBeInTheDocument();

    // The regeneration finished with no artifact: the run settles to no_result.
    actor.setRun({ ...baseRun, videoStatus: VideoOutputStatus.no_result });
    await user.click(screen.getByTestId("simulation.refresh_button"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("simulation.generating_state"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the run's script and tweak controls available while generating", async () => {
    infra.actor = actorWithMutableRun({
      ...baseRun,
      videoStatus: VideoOutputStatus.generating,
    });
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.generating_state"),
    ).toBeInTheDocument();
    // The generating banner is additive: the operator can still read the run
    // and submit another tweak.
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.tweak.input")).toBeInTheDocument();
  });
});
