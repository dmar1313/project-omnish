import { type DnaRecord, RunDecision, RunStatus } from "@/backend";
import LiveFeedPage from "@/pages/LiveFeedPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const dna: DnaRecord = {
  id: 3n,
  characterName: "Marlow Quinn",
  identityBlocks: "A cartographer of dead stars.",
  immutableTraits: "Never removes the visor.",
  visualMarkers: "Amber visor, ash-grey coat.",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

const startedRun = {
  id: 11n,
  status: RunStatus.running,
  rawInput: "Marlow crosses the Veil.",
  tokenCostBurn: 0,
  timestamp: 1_700_000_000_000_000_000n,
  characterId: 3n,
  generatedAssets: [],
  formatOutputs: [],
};

describe("LiveFeedPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: vi.fn(async () => startedRun),
    });
  });

  it("renders the composer, workbench, and run list", async () => {
    renderWithProviders(<LiveFeedPage />);

    expect(
      await screen.findByRole("heading", { name: /live production feed/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("feed.prompt.panel")).toBeInTheDocument();
    expect(screen.getByTestId("feed.workbench.panel")).toBeInTheDocument();
    expect(screen.getByTestId("feed.runs.panel")).toBeInTheDocument();
  });

  it("starts a production run from a raw idea", async () => {
    const user = userEvent.setup();
    const start = vi.fn(async () => startedRun);
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: start,
    });

    renderWithProviders(<LiveFeedPage />);

    await user.type(
      await screen.findByTestId("feed.prompt.textarea"),
      "Marlow crosses the Veil.",
    );
    await user.click(screen.getByTestId("feed.prompt.submit_button"));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith({
        rawInput: "Marlow crosses the Veil.",
        characterId: undefined,
        assetIngredientIds: [],
      });
    });
  });

  it("navigates to the Simulation Inspector for the new run on submit", async () => {
    const user = userEvent.setup();
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: vi.fn(async () => startedRun),
    });

    renderWithProviders(<LiveFeedPage />);

    await user.type(
      await screen.findByTestId("feed.prompt.textarea"),
      "Marlow crosses the Veil.",
    );
    await user.click(screen.getByTestId("feed.prompt.submit_button"));

    // No manual click: the operator lands on the run's inspector immediately.
    await waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith({
        to: "/simulation",
        search: { runId: "11" },
      });
    });
  });

  it("submits the selected target character with the run", async () => {
    const user = userEvent.setup();
    const start = vi.fn(async () => startedRun);
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: start,
    });

    renderWithProviders(<LiveFeedPage />);

    await user.type(
      await screen.findByTestId("feed.prompt.textarea"),
      "A quiet beat.",
    );
    await user.click(screen.getByTestId("feed.prompt.select"));
    await user.click(
      await screen.findByRole("option", { name: "Marlow Quinn" }),
    );
    await user.click(screen.getByTestId("feed.prompt.submit_button"));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith({
        rawInput: "A quiet beat.",
        characterId: 3n,
        assetIngredientIds: [],
      });
    });
  });

  it("disables submission until a raw idea is entered", async () => {
    renderWithProviders(<LiveFeedPage />);

    expect(
      await screen.findByTestId("feed.prompt.submit_button"),
    ).toBeDisabled();
  });

  it("shows the empty run state before any run exists", async () => {
    renderWithProviders(<LiveFeedPage />);

    expect(
      await screen.findByTestId("feed.runs.empty_state"),
    ).toBeInTheDocument();
  });

  it("reflects the operator's decision with a decision-aware badge", async () => {
    const decidedRun = {
      id: 11n,
      status: RunStatus.completed,
      tokenCostBurn: 4200,
      timestamp: 1_700_000_000_000_000_000n,
      characterId: 3n,
    };
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => [decidedRun]),
      listRunDecisions: vi.fn(async () => [
        [
          decidedRun.id,
          { decision: RunDecision.approved, acceptedRevision: 1n },
        ],
      ]),
    });

    renderWithProviders(<LiveFeedPage />);

    const item = await screen.findByTestId("feed.runs.item.1");
    // The decision badge replaces the run's own "Completed" status.
    expect(item).toHaveTextContent("Approved");
    expect(item).not.toHaveTextContent("Completed");
  });

  it("shows the run status badge while no decision has been made", async () => {
    const runningRun = {
      id: 12n,
      status: RunStatus.running,
      tokenCostBurn: 0,
      timestamp: 1_700_000_000_000_000_000n,
      characterId: 3n,
    };
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => [runningRun]),
      listRunDecisions: vi.fn(async () => [
        [runningRun.id, { decision: RunDecision.in_progress }],
      ]),
    });

    renderWithProviders(<LiveFeedPage />);

    const item = await screen.findByTestId("feed.runs.item.1");
    expect(item).toHaveTextContent("Running");
  });

  // ---- Baseline behavior the post-submit navigation change must preserve ----

  it("clears the composer after a successful submission", async () => {
    const user = userEvent.setup();
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: vi.fn(async () => startedRun),
    });

    renderWithProviders(<LiveFeedPage />);

    const textarea = await screen.findByTestId("feed.prompt.textarea");
    await user.type(textarea, "Marlow crosses the Veil.");
    await user.click(screen.getByTestId("feed.prompt.submit_button"));

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("surfaces a submission error without navigating away", async () => {
    const user = userEvent.setup();
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: vi.fn(async () => {
        throw new Error("inference unavailable");
      }),
    });

    renderWithProviders(<LiveFeedPage />);

    await user.type(
      await screen.findByTestId("feed.prompt.textarea"),
      "Marlow crosses the Veil.",
    );
    await user.click(screen.getByTestId("feed.prompt.submit_button"));

    expect(
      await screen.findByTestId("feed.prompt.error_state"),
    ).toBeInTheDocument();
    // The feed remains mounted so the operator can retry.
    expect(screen.getByTestId("feed.page")).toBeInTheDocument();
  });

  it("keeps the run list reachable after a run is started", async () => {
    const user = userEvent.setup();
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [dna]),
      listRuns: vi.fn(async () => []),
      startProductionRun: vi.fn(async () => startedRun),
    });

    renderWithProviders(<LiveFeedPage />);

    await user.type(
      await screen.findByTestId("feed.prompt.textarea"),
      "Marlow crosses the Veil.",
    );
    await user.click(screen.getByTestId("feed.prompt.submit_button"));

    await waitFor(() => {
      expect(screen.getByTestId("feed.runs.panel")).toBeInTheDocument();
    });
  });
});
