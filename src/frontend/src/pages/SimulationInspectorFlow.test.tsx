import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  type RunDecisionState,
  RunStatus,
  SimulationStep,
  VideoOutputStatus,
} from "@/backend";
import SimulationPage from "@/pages/SimulationPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the Simulation Inspector's end-of-flow
 * behavior. The upcoming work adds a persistent progress stepper and a
 * Generated Videos section, and reworks how a run is reached from the feed.
 * These tests freeze the accepted behavior that must survive that change:
 *
 *  - a completed, undecided run offers tweak + Accept/Reject/Continue;
 *  - a decided run shows an outcome panel with a working forward action;
 *  - a halted/failed run shows a recovery action rather than a terminal screen.
 *
 * They deliberately do NOT assert anything about the stepper or the Generated
 * Videos view, which are the intentional additions.
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

const completedRun: ProductionRun = {
  id: 21n,
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
  formatOutputs: [],
  videoStatus: VideoOutputStatus.no_result,
};

const haltedRun: ProductionRun = {
  ...completedRun,
  id: 22n,
  status: RunStatus.halted,
  generatedAssets: [],
};

const failedRun: ProductionRun = {
  ...completedRun,
  id: 23n,
  status: RunStatus.failed,
  generatedAssets: [],
};

const originalRevision: Revision = {
  revisionNumber: 1n,
  generatedAssets: completedRun.generatedAssets,
  formatOutputs: completedRun.formatOutputs,
  tokenCostBurn: completedRun.tokenCostBurn,
  timestamp: completedRun.timestamp,
};

const logs = [
  {
    id: 1n,
    runId: completedRun.id,
    rawInput: completedRun.rawInput,
    stepName: SimulationStep.ingestion,
    timestamp: 1_700_000_000_000_000_000n,
    evaluationOutput: "Ingested raw idea.",
  },
];

/**
 * A stateful mock actor for the decision flow. `acceptRun`/`rejectRun` mutate
 * the in-memory decision so the page's refetches observe the change, exactly as
 * the real canister would.
 */
function decisionActorFor(run: ProductionRun) {
  let decision: RunDecisionState = { decision: RunDecision.completed };

  return createMockActor({
    listRuns: vi.fn(async () => [
      {
        id: run.id,
        status: run.status,
        tokenCostBurn: run.tokenCostBurn,
        timestamp: run.timestamp,
        characterId: run.characterId,
      },
    ]),
    getRun: vi.fn(async () => run),
    listSimulationLogs: vi.fn(async () => logs),
    listAssets: vi.fn(async () => []),
    listRevisions: vi.fn(async () => [originalRevision]),
    getRunDecision: vi.fn(async () => decision),
    listRunDecisions: vi.fn(async () => [[run.id, decision]]),
    acceptRun: vi.fn(async (_runId: bigint, revisionNumber: bigint) => {
      decision = {
        decision: RunDecision.approved,
        acceptedRevision: revisionNumber,
      };
      return run;
    }),
    rejectRun: vi.fn(async (_runId: bigint, reason: string | null) => {
      decision = {
        decision: RunDecision.rejected,
        rejectionReason: reason ?? undefined,
      };
      return run;
    }),
  });
}

describe("Simulation Inspector end-of-flow", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
    infra.actor = decisionActorFor(completedRun);
  });

  it("offers tweak and Accept/Reject/Continue for a completed, undecided run", async () => {
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByRole("heading", { name: /suggest tweaks/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("simulation.tweak.input")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.accept_button")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.reject_button")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.continue_button"),
    ).toBeInTheDocument();
  });

  it("shows an outcome panel with a working forward action after accepting", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.accept_button"));

    const outcome = await screen.findByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run approved/i);

    // The forward action is real navigation, not a dead end.
    await user.click(screen.getByTestId("simulation.advance_stage_button"));
    expect(router.navigate).toHaveBeenCalledWith({ to: "/optimization" });
  });

  it("keeps a rejected run recoverable via return-to-feed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.reject_button"));
    await user.type(
      await screen.findByTestId("simulation.reject.input"),
      "Tone is off.",
    );
    await user.click(screen.getByTestId("simulation.reject.confirm_button"));

    const outcome = await screen.findByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run rejected/i);
    await user.click(screen.getByTestId("simulation.return_to_feed_button"));
    expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows a recovery card rather than a terminal screen for a halted run", async () => {
    infra.actor = decisionActorFor(haltedRun);
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.halt_reason.card"),
    ).toHaveTextContent(/blocking violation/i);
    // The inspector still renders its reasoning surface, so the operator has a
    // way to understand and recover from the halt.
    expect(
      screen.getByTestId("simulation.agent_outputs.section"),
    ).toBeInTheDocument();
  });

  it("shows a recovery card for a failed run", async () => {
    infra.actor = decisionActorFor(failedRun);
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.halt_reason.card"),
    ).toHaveTextContent(/blocking violation/i);
  });

  it("navigates to the inspector for a run selected from the list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimulationPage />);

    const item = await screen.findByTestId("simulation.run_list.item");
    await user.click(item);

    await waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith({
        to: "/simulation",
        search: { runId: "21" },
      });
    });
  });
});
