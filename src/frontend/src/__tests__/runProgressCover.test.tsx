import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  RunStatus,
  type SimulationLog,
  SimulationStep,
  VideoOutputStatus,
} from "@/backend";
import SimulationPage from "@/pages/SimulationPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the run-progress regression: a started production run must progress
 * through its stages or settle to an honest error state, and must never hang in
 * "Running" with 0 stages logged.
 *
 * The backend change drives the pipeline inline (`startRun` awaits `processRun`)
 * so a run always reaches a terminal state. This suite pins the frontend's
 * observable half of that contract on the Simulation Inspector:
 *
 *   - a `#running` run with no stage logs yet still renders the live-progress
 *     surface, honestly reporting "0 stages logged" and that the pipeline is
 *     initializing — not a blank or silently stuck screen;
 *   - a `#running` run with stage logs reports the current stage and the count,
 *     so progress is observable while it runs;
 *   - a `#failed` run (an inference failure that the backend settles rather than
 *     leaving `#running`) surfaces the honest error/recovery card and does NOT
 *     show the live-progress "Running" surface.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * run read methods; it cannot call `startProductionRun` because that requires
 * live inference.
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

const runningRun: ProductionRun = {
  id: 7n,
  status: RunStatus.running,
  rawInput: "Marlow crosses the Veil at dusk.",
  tokenCostBurn: 0,
  timestamp: 1_700_000_000_000_000_000n,
  characterId: 3n,
  generatedAssets: [],
  formatOutputs: [],
  videoStatus: VideoOutputStatus.generating,
};

const failedRun: ProductionRun = {
  ...runningRun,
  status: RunStatus.failed,
  videoStatus: VideoOutputStatus.no_result,
};

const originalRevision: Revision = {
  revisionNumber: 1n,
  generatedAssets: [],
  formatOutputs: [],
  tokenCostBurn: 0,
  timestamp: runningRun.timestamp,
};

function stageLog(
  id: bigint,
  stepName: SimulationStep,
  evaluationOutput: string,
): SimulationLog {
  return {
    id,
    runId: runningRun.id,
    rawInput: runningRun.rawInput,
    stepName,
    timestamp: runningRun.timestamp,
    evaluationOutput,
  };
}

function actorFor(run: ProductionRun, logs: SimulationLog[]) {
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
    getRunDecision: vi.fn(async () => ({
      decision: RunDecision.in_progress,
    })),
    listRunDecisions: vi.fn(async () => [
      [run.id, { decision: RunDecision.in_progress }],
    ]),
  });
}

describe("Simulation Inspector run progress", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("renders the live-progress surface for a running run with 0 stages logged", async () => {
    // The backend persists #running before the first inference call, so the
    // inspector can observe a running run with no logs yet. It must show an
    // honest in-progress surface rather than a blank or hung screen.
    infra.actor = actorFor(runningRun, []);

    renderWithProviders(<SimulationPage />);

    const progress = await screen.findByTestId(
      "simulation.live_progress.section",
    );
    expect(progress).toHaveTextContent(/pipeline running/i);
    expect(progress).toHaveTextContent(/0 stages logged/i);
    expect(progress).toHaveTextContent(/initializing the evaluation pipeline/i);
    // The run is not presented as a terminal result.
    expect(
      screen.queryByTestId("simulation.halt_reason.card"),
    ).not.toBeInTheDocument();
  });

  it("reports the current stage and count for a running run with stage logs", async () => {
    infra.actor = actorFor(runningRun, [
      stageLog(1n, SimulationStep.ingestion, "Ingested raw idea."),
      stageLog(2n, SimulationStep.asset_binding, "Bound assets: (none)"),
    ]);

    renderWithProviders(<SimulationPage />);

    const progress = await screen.findByTestId(
      "simulation.live_progress.section",
    );
    expect(progress).toHaveTextContent(/2 stages logged/i);
    // The latest logged stage is surfaced as the current stage.
    expect(progress).toHaveTextContent(/current stage: asset binding/i);
  });

  it("settles a failed run to an honest error state, not the Running surface", async () => {
    // An inference failure settles the run to #failed. The inspector must show
    // the recovery card and must not keep presenting the run as still running.
    infra.actor = actorFor(failedRun, [
      stageLog(
        1n,
        SimulationStep.fracture,
        "FAILED. Agent inference call did not complete.",
      ),
    ]);

    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.halt_reason.card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("simulation.live_progress.section"),
    ).not.toBeInTheDocument();
    // The failure is recorded in the evaluation stream, so the operator can see
    // why the run stopped.
    expect(
      screen.getByText(/agent inference call did not complete/i),
    ).toBeInTheDocument();
  });

  it("settles a run to an honest error when the inference capability is unavailable", async () => {
    // The backend probes the inference capability before calling it and settles
    // the run to #failed with a specific reason when the environment has no
    // credentials. The inspector must surface that honest reason and must not
    // keep presenting the run as still running with no stages logged.
    infra.actor = actorFor(failedRun, [
      stageLog(
        1n,
        SimulationStep.fracture,
        "FAILED. Inference capability is unavailable in this environment; no agent output could be produced.",
      ),
    ]);

    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.halt_reason.card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("simulation.live_progress.section"),
    ).not.toBeInTheDocument();
    // The honest capability reason is visible, not a silent or generic failure.
    expect(
      screen.getByText(/inference capability is unavailable/i),
    ).toBeInTheDocument();
  });
});
