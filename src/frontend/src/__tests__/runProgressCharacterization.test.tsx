import {
  type ProductionRun,
  RunDecision,
  RunStatus,
  type RunSummary,
  VideoOutputStatus,
} from "@/backend";
import LiveFeedPage from "@/pages/LiveFeedPage";
import SimulationPage from "@/pages/SimulationPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the live run-progress surfaces, ahead of the
 * run-pipeline change that makes `startRun` drive `processRun` inline so a run
 * always reaches a terminal state.
 *
 * The request intentionally changes the backend's run lifecycle timing. These
 * tests deliberately do NOT pin how quickly a run settles, the number of
 * backend calls, or any timer shape. They pin the adjacent frontend behavior
 * that must keep working once the pipeline is reworked:
 *
 *   - the Live Production Feed honestly reports whether it is streaming: "Idle"
 *     with no active run, "Streaming live" while a run is pending/running, so
 *     the operator can tell a run is in flight;
 *   - the Simulation Inspector discovers a run that was started elsewhere (e.g.
 *     on the Live Feed) by polling the runs list, rather than deadlocking on an
 *     already-active run it never sees.
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

const runningSummary: RunSummary = {
  id: runningRun.id,
  status: runningRun.status,
  tokenCostBurn: runningRun.tokenCostBurn,
  timestamp: runningRun.timestamp,
  characterId: runningRun.characterId,
};

describe("Live Production Feed streaming indicator", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
  });

  it("reports Idle when no run is active", async () => {
    infra.actor = createMockActor({
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
    });

    renderWithProviders(<LiveFeedPage />);

    // The feed has loaded (its empty run state is shown) and honestly reports
    // that nothing is streaming.
    expect(
      await screen.findByTestId("feed.runs.empty_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.queryByText("Streaming live")).not.toBeInTheDocument();
  });

  it("reports Streaming live while a run is active", async () => {
    infra.actor = createMockActor({
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => [runningSummary]),
      listRunDecisions: vi.fn(async () => [
        [runningRun.id, { decision: RunDecision.in_progress }],
      ]),
    });

    renderWithProviders(<LiveFeedPage />);

    // The active run is discovered and the feed reports it is streaming, so the
    // operator can tell a run is in flight without opening the inspector.
    expect(await screen.findByText("Streaming live")).toBeInTheDocument();
    expect(screen.queryByText("Idle")).not.toBeInTheDocument();
  });
});

describe("Simulation Inspector run discovery", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("discovers a run started elsewhere by polling the runs list", async () => {
    // The runs list is empty on first load, then a run started on the Live Feed
    // appears. The inspector polls the runs list continuously, so it must pick
    // the run up on its own rather than deadlocking on an already-active run it
    // never sees.
    let runs: RunSummary[] = [];
    const actor = createMockActor({
      listRuns: vi.fn(async () => runs),
      getRun: vi.fn(async () => runningRun),
      listSimulationLogs: vi.fn(async () => []),
      listAssets: vi.fn(async () => []),
      listRevisions: vi.fn(async () => []),
      getRunDecision: vi.fn(async () => ({
        decision: RunDecision.in_progress,
      })),
      listRunDecisions: vi.fn(async () => [
        [runningRun.id, { decision: RunDecision.in_progress }],
      ]),
    });
    infra.actor = actor;

    renderWithProviders(<SimulationPage />);

    // Initially there is no run to inspect.
    expect(
      await screen.findByTestId("simulation.run_list.empty_state"),
    ).toBeInTheDocument();

    // A run is started elsewhere; the next poll tick must discover it.
    runs = [runningSummary];
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_600));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("simulation.run_list.item"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("simulation.run_list.item")).toHaveTextContent(
      "Running",
    );
  });
});
