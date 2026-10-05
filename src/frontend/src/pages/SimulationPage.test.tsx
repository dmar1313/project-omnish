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

const haltedRun: ProductionRun = {
  ...completedRun,
  id: 8n,
  status: RunStatus.halted,
  generatedAssets: [],
  formatOutputs: [],
};

const logs = [
  {
    id: 1n,
    runId: 7n,
    rawInput: completedRun.rawInput,
    stepName: SimulationStep.ingestion,
    timestamp: 1_700_000_000_000_000_000n,
    evaluationOutput: "Ingested raw idea.",
  },
  {
    id: 2n,
    runId: 7n,
    rawInput: completedRun.rawInput,
    stepName: SimulationStep.lore_check,
    timestamp: 1_700_000_001_000_000_000n,
    evaluationOutput: "Lore check passed.",
  },
];

function actorFor(run: ProductionRun) {
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
  });
}

const originalRevision: Revision = {
  revisionNumber: 1n,
  generatedAssets: completedRun.generatedAssets,
  formatOutputs: completedRun.formatOutputs,
  tokenCostBurn: completedRun.tokenCostBurn,
  timestamp: completedRun.timestamp,
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
 * A stateful mock actor for the revision + decision flow. `submitTweak`,
 * `acceptRun`, and `rejectRun` mutate the in-memory revision/decision state so
 * the page's refetches observe the change, exactly as the real canister would.
 */
function revisionActorFor(run: ProductionRun) {
  let revisions: Revision[] = [originalRevision];
  let decision: RunDecisionState = { decision: RunDecision.completed };

  const actor = createMockActor({
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
    listRevisions: vi.fn(async () => revisions),
    getRevision: vi.fn(
      async (_runId: bigint, revisionNumber: bigint) =>
        revisions.find((r) => r.revisionNumber === revisionNumber) ?? null,
    ),
    getRunDecision: vi.fn(async () => decision),
    listRunDecisions: vi.fn(async () => [[run.id, decision]]),
    submitTweak: vi.fn(async () => {
      revisions = [...revisions, tweakedRevision];
      return tweakedRevision;
    }),
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
    continueRun: vi.fn(async (_runId: bigint, revisionNumber: bigint) => {
      decision = {
        decision: RunDecision.approved,
        acceptedRevision: revisionNumber,
      };
      return run;
    }),
  });

  return actor;
}

describe("SimulationPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
    infra.actor = actorFor(completedRun);
  });

  it("renders agent outputs and adapted platform formats for a clean run", async () => {
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByRole("heading", { name: /reasoning trail/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.getByText("Visual prompt text.")).toBeInTheDocument();
    expect(screen.getByText("Continuity notes.")).toBeInTheDocument();
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Short-form adaptation.")).toBeInTheDocument();
  });

  it("streams sequential stage logs with step labels", async () => {
    renderWithProviders(<SimulationPage />);

    expect(await screen.findByText("Ingested raw idea.")).toBeInTheDocument();
    expect(screen.getByText("Lore check passed.")).toBeInTheDocument();

    const logItems = screen.getAllByTestId("simulation.log_stream.item");
    expect(logItems).toHaveLength(2);
    expect(logItems[0]).toHaveTextContent("Ingestion");
    expect(logItems[1]).toHaveTextContent("Lore Check");
  });

  it("shows a blocking violation reason and no outputs for a halted run", async () => {
    infra.actor = actorFor(haltedRun);
    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.halt_reason.card"),
    ).toHaveTextContent(/blocking violation/i);
    expect(
      screen.getByTestId("simulation.formats.empty_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.agent_outputs.section"),
    ).toBeInTheDocument();
  });

  it("selects a run from the list and navigates with its id", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimulationPage />);

    const item = await screen.findByTestId("simulation.run_list.item");
    await user.click(item);

    await waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith({
        to: "/simulation",
        search: { runId: "7" },
      });
    });
  });

  it("shows an empty state when no runs exist", async () => {
    infra.actor = createMockActor({
      listRuns: vi.fn(async () => []),
      getRun: vi.fn(async () => null),
      listSimulationLogs: vi.fn(async () => []),
      listAssets: vi.fn(async () => []),
    });

    renderWithProviders(<SimulationPage />);

    expect(
      await screen.findByTestId("simulation.run_list.empty_state"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("simulation.empty_state")).toBeInTheDocument();
  });

  // ---- Revision + decision flow ----

  it("shows the tweak input and proceed controls for a completed run", async () => {
    infra.actor = revisionActorFor(completedRun);
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

  it("submits a tweak and displays the new revision in place", async () => {
    const user = userEvent.setup();
    const actor = revisionActorFor(completedRun);
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

    // The refreshed script is shown in place and the instruction is recorded
    // in the revision history.
    expect(await screen.findByText("Warmer writer draft.")).toBeInTheDocument();
    const items = await screen.findAllByTestId("simulation.revisions.item");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("Make the ending warmer.");
  });

  it("selects an earlier revision and displays its script", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    // Submit a tweak so there are two revisions, then select the original.
    const input = await screen.findByTestId("simulation.tweak.input");
    await user.type(input, "Make the ending warmer.");
    await user.click(screen.getByTestId("simulation.tweak.submit_button"));
    expect(await screen.findByText("Warmer writer draft.")).toBeInTheDocument();

    const items = await screen.findAllByTestId("simulation.revisions.item");
    await user.click(items[0]);

    expect(await screen.findByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.queryByText("Warmer writer draft.")).not.toBeInTheDocument();
  });

  it("accepts a run and reflects approval in the run list", async () => {
    const user = userEvent.setup();
    const actor = revisionActorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.accept_button"));

    await waitFor(() => {
      expect(actor.acceptRun).toHaveBeenCalledWith(7n, 1n);
    });
    // The run list badge switches from the run status to the decision.
    await waitFor(() => {
      expect(screen.getByTestId("simulation.run_list.item")).toHaveTextContent(
        "Approved",
      );
    });
    expect(
      await screen.findByTestId("simulation.proceed.decided_state"),
    ).toHaveTextContent(/approved/i);
  });

  it("rejects a run with a reason and reflects rejection in the run list", async () => {
    const user = userEvent.setup();
    const actor = revisionActorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.reject_button"));
    await user.type(
      await screen.findByTestId("simulation.reject.input"),
      "Tone is off.",
    );
    await user.click(screen.getByTestId("simulation.reject.confirm_button"));

    await waitFor(() => {
      expect(actor.rejectRun).toHaveBeenCalledWith(7n, "Tone is off.");
    });
    await waitFor(() => {
      expect(screen.getByTestId("simulation.run_list.item")).toHaveTextContent(
        "Rejected",
      );
    });
    expect(screen.getByTestId("simulation.decision.reason")).toHaveTextContent(
      "Tone is off.",
    );
  });

  it("disables the controls while a tweak is generating", async () => {
    const user = userEvent.setup();
    let resolveTweak: ((revision: Revision) => void) | undefined;
    const actor = revisionActorFor(completedRun);
    actor.submitTweak = vi.fn(
      () =>
        new Promise<Revision>((resolve) => {
          resolveTweak = resolve;
        }),
    );
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    const input = await screen.findByTestId("simulation.tweak.input");
    await user.type(input, "Make the ending warmer.");
    await user.click(screen.getByTestId("simulation.tweak.submit_button"));

    await waitFor(() => {
      expect(screen.getByTestId("simulation.tweak.input")).toBeDisabled();
    });
    expect(screen.getByTestId("simulation.accept_button")).toBeDisabled();
    expect(screen.getByTestId("simulation.reject_button")).toBeDisabled();
    expect(screen.getByTestId("simulation.continue_button")).toBeDisabled();

    resolveTweak?.(tweakedRevision);
    await waitFor(() => {
      expect(screen.getByTestId("simulation.tweak.input")).not.toBeDisabled();
    });
  });

  it("surfaces a tweak error without losing the displayed revision", async () => {
    const user = userEvent.setup();
    const actor = revisionActorFor(completedRun);
    actor.submitTweak = vi.fn(async () => {
      throw new Error("inference unavailable");
    });
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    const input = await screen.findByTestId("simulation.tweak.input");
    await user.type(input, "Make the ending warmer.");
    await user.click(screen.getByTestId("simulation.tweak.submit_button"));

    expect(
      await screen.findByTestId("simulation.tweak.error_state"),
    ).toBeInTheDocument();
    // The previously displayed revision is still rendered.
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
  });

  // ---- Adjacent invariants the accept/next-step change must preserve ----

  it("accepts the revision the operator selected, not the latest", async () => {
    const user = userEvent.setup();
    const actor = revisionActorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    // Create a second revision, then step back to the original before deciding.
    const input = await screen.findByTestId("simulation.tweak.input");
    await user.type(input, "Make the ending warmer.");
    await user.click(screen.getByTestId("simulation.tweak.submit_button"));
    expect(await screen.findByText("Warmer writer draft.")).toBeInTheDocument();

    const items = await screen.findAllByTestId("simulation.revisions.item");
    await user.click(items[0]);
    expect(await screen.findByText("Writer draft text.")).toBeInTheDocument();

    await user.click(screen.getByTestId("simulation.accept_button"));

    await waitFor(() => {
      expect(actor.acceptRun).toHaveBeenCalledWith(7n, 1n);
    });
  });

  it("continues the displayed revision through the backend", async () => {
    const user = userEvent.setup();
    const actor = revisionActorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.continue_button"));

    await waitFor(() => {
      expect(actor.continueRun).toHaveBeenCalledWith(7n, 1n);
    });
  });

  // ---- Decided run is never a dead end ----

  it("shows an outcome panel with the decision status after accepting", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.accept_button"));

    const outcome = await screen.findByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run approved/i);
    expect(outcome).toHaveTextContent(/approved at v1/i);
    // The decision status is visible in the inspector after the decision.
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
  });

  it("advances an approved run to the next stage", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.accept_button"));
    await user.click(
      await screen.findByTestId("simulation.advance_stage_button"),
    );

    expect(router.navigate).toHaveBeenCalledWith({ to: "/optimization" });
  });

  it("returns to the Live Production Feed from a decided run", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.accept_button"));
    await user.click(
      await screen.findByTestId("simulation.return_to_feed_button"),
    );

    expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("offers a return-to-feed next step after rejecting", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("simulation.reject_button"));
    await user.type(
      await screen.findByTestId("simulation.reject.input"),
      "Tone is off.",
    );
    await user.click(screen.getByTestId("simulation.reject.confirm_button"));

    const outcome = await screen.findByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run rejected/i);
    // A rejected run has no next stage, but it is still not a dead end.
    expect(
      screen.queryByTestId("simulation.advance_stage_button"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByTestId("simulation.return_to_feed_button"));
    expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  // ---- Persistent progress stepper + Generated Videos entry point ----

  it("shows the persistent Prompt → Simulation → Review → Generated Videos stepper", async () => {
    renderWithProviders(<SimulationPage />);

    const stepper = await screen.findByTestId("flow.stepper");
    expect(stepper).toBeInTheDocument();
    expect(screen.getByTestId("flow.stepper.prompt.tab")).toHaveTextContent(
      "Prompt",
    );
    expect(screen.getByTestId("flow.stepper.simulation.tab")).toHaveTextContent(
      "Simulation",
    );
    expect(screen.getByTestId("flow.stepper.review.tab")).toHaveTextContent(
      "Review",
    );
    expect(screen.getByTestId("flow.stepper.videos.tab")).toHaveTextContent(
      "Generated Videos",
    );
  });

  it("marks the current stage on the stepper for a completed run", async () => {
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    // A completed, undecided run is awaiting review.
    const review = await screen.findByTestId("flow.stepper.review.tab");
    expect(review).toHaveAttribute("aria-current", "step");
  });

  it("opens the run's generated videos with the displayed revision", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    await user.click(
      await screen.findByTestId("simulation.view_videos_button"),
    );

    expect(router.navigate).toHaveBeenCalledWith({
      to: "/videos",
      search: { runId: "7", revision: "1" },
    });
  });

  it("jumps to the feed from the stepper's Prompt stage", async () => {
    const user = userEvent.setup();
    infra.actor = revisionActorFor(completedRun);
    renderWithProviders(<SimulationPage />);

    await user.click(await screen.findByTestId("flow.stepper.prompt.tab"));

    expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows the run's own status badge while no decision has been made", async () => {
    const runningRun: ProductionRun = {
      ...completedRun,
      status: RunStatus.running,
    };
    infra.actor = createMockActor({
      listRuns: vi.fn(async () => [
        {
          id: runningRun.id,
          status: runningRun.status,
          tokenCostBurn: runningRun.tokenCostBurn,
          timestamp: runningRun.timestamp,
          characterId: runningRun.characterId,
        },
      ]),
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

    renderWithProviders(<SimulationPage />);

    // The run list surfaces the live run status until a decision retires it.
    const item = await screen.findByTestId("simulation.run_list.item");
    expect(item).toHaveTextContent("Running");
  });
});
