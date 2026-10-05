import {
  AgentKind,
  type AssetIngredient,
  AssetKind,
  type ProductionRun,
  type Revision,
  RunDecision,
  type RunDecisionState,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import { RunDetail } from "@/components/RunDetail";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the Simulation Inspector's reasoning trail.
 *
 * The tweak/revision/accept-reject work intentionally extends this surface, so
 * these tests pin the adjacent behavior that must keep working: the source
 * input, per-agent outputs, bound ingredients, adapted platform formats, and
 * the halted-run violation card.
 */

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

const ingredients: AssetIngredient[] = [
  {
    id: 11n,
    fileName: "marlow-reference.png",
    fileType: AssetKind.image,
    storageUrl: "https://storage.example/marlow-reference.png",
    tags: ["reference"],
    createdAt: 1_700_000_000_000_000_000n,
    linkedCharacterId: 3n,
  },
];

describe("RunDetail", () => {
  it("renders the source input, agent outputs, and adapted formats", () => {
    render(<RunDetail run={completedRun} ingredients={ingredients} />);

    expect(
      screen.getByRole("heading", { name: /reasoning trail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Marlow crosses the Veil at dusk."),
    ).toBeInTheDocument();
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.getByText("Visual prompt text.")).toBeInTheDocument();
    expect(screen.getByText("Continuity notes.")).toBeInTheDocument();
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Short-form adaptation.")).toBeInTheDocument();
    expect(screen.getByText("4,200 tokens")).toBeInTheDocument();
  });

  it("lists bound ingredients with their kind and linked character", () => {
    render(<RunDetail run={completedRun} ingredients={ingredients} />);

    const item = screen.getByTestId("simulation.ingredients.item");
    expect(item).toHaveTextContent("marlow-reference.png");
    expect(item).toHaveTextContent(/image/i);
    expect(item).toHaveTextContent(/char #3/i);
  });

  it("shows empty states when no ingredients or formats are present", () => {
    const bareRun: ProductionRun = {
      ...completedRun,
      generatedAssets: [],
      formatOutputs: [],
    };

    render(<RunDetail run={bareRun} ingredients={[]} />);

    expect(
      screen.getByTestId("simulation.ingredients.empty_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.formats.empty_state"),
    ).toBeInTheDocument();
    // Every agent card still renders, each reporting no recorded output.
    expect(screen.getAllByText("No output recorded.")).toHaveLength(3);
  });

  it("surfaces a blocking violation for a halted run", () => {
    const haltedRun: ProductionRun = {
      ...completedRun,
      status: RunStatus.halted,
      generatedAssets: [],
      formatOutputs: [],
    };

    render(<RunDetail run={haltedRun} ingredients={[]} />);

    expect(screen.getByTestId("simulation.halt_reason.card")).toHaveTextContent(
      /blocking violation/i,
    );
  });

  it("does not show the violation card for a completed run", () => {
    render(<RunDetail run={completedRun} ingredients={ingredients} />);

    expect(
      screen.queryByTestId("simulation.halt_reason.card"),
    ).not.toBeInTheDocument();
  });

  it("renders the injected produced-video surface alongside the agent outputs", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        mediaSlot={<div data-ocid="produced-video-slot">Produced video</div>}
      />,
    );

    // The produced video artifact is shown next to the existing agent text
    // outputs, not instead of them.
    expect(screen.getByTestId("produced-video-slot")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.agent_outputs.section"),
    ).toBeInTheDocument();
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
  });

  // ---- Revision + decision flow ----

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

  const completedDecision: RunDecisionState = {
    decision: RunDecision.completed,
  };

  it("shows the run status and current decision badges for a completed run", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={completedDecision}
        onSubmitTweak={vi.fn()}
      />,
    );

    // The run's own status badge and its decision badge are both visible.
    expect(screen.getAllByText("Completed")).toHaveLength(2);
  });

  it("shows the tweak input and Accept/Reject/Continue for a completed run", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={completedDecision}
        onSubmitTweak={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /suggest tweaks/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("simulation.tweak.input")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.accept_button")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.reject_button")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.continue_button"),
    ).toBeInTheDocument();
  });

  it("submits a typed tweak instruction and clears the input", async () => {
    const user = userEvent.setup();
    const onSubmitTweak = vi.fn();
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={completedDecision}
        onSubmitTweak={onSubmitTweak}
      />,
    );

    const input = screen.getByTestId("simulation.tweak.input");
    await user.type(input, "Make the ending warmer.");
    await user.click(screen.getByTestId("simulation.tweak.submit_button"));

    expect(onSubmitTweak).toHaveBeenCalledWith("Make the ending warmer.");
    expect(input).toHaveValue("");
  });

  it("lists each revision with its instruction and timestamp", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision, tweakedRevision]}
        decision={completedDecision}
        onSubmitTweak={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId("simulation.revisions.item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("v1");
    expect(items[0]).toHaveTextContent(/original generation/i);
    expect(items[1]).toHaveTextContent("v2");
    expect(items[1]).toHaveTextContent("Make the ending warmer.");
  });

  it("displays the selected revision's script in place", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision, tweakedRevision]}
        decision={completedDecision}
        selectedRevision={1n}
        onSubmitTweak={vi.fn()}
      />,
    );

    // The original revision's writer output is shown, not the latest tweak's.
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
    expect(screen.queryByText("Warmer writer draft.")).not.toBeInTheDocument();
  });

  it("reports the selected revision when a history entry is clicked", async () => {
    const user = userEvent.setup();
    const onSelectRevision = vi.fn();
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision, tweakedRevision]}
        decision={completedDecision}
        onSelectRevision={onSelectRevision}
        onSubmitTweak={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId("simulation.revisions.item");
    await user.click(items[0]);

    expect(onSelectRevision).toHaveBeenCalledWith(1n);
  });

  it("disables the tweak input and controls while a tweak is generating", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={completedDecision}
        onSubmitTweak={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onContinue={vi.fn()}
        isTweaking
      />,
    );

    expect(screen.getByTestId("simulation.tweak.input")).toBeDisabled();
    expect(screen.getByTestId("simulation.tweak.submit_button")).toBeDisabled();
    expect(screen.getByTestId("simulation.accept_button")).toBeDisabled();
    expect(screen.getByTestId("simulation.reject_button")).toBeDisabled();
    expect(screen.getByTestId("simulation.continue_button")).toBeDisabled();
    expect(
      screen.getByTestId("simulation.tweak.loading_state"),
    ).toBeInTheDocument();
  });

  it("surfaces a tweak error without losing the displayed revision", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision, tweakedRevision]}
        decision={completedDecision}
        selectedRevision={1n}
        onSubmitTweak={vi.fn()}
        tweakError="Tweak generation failed. The previous revision is still displayed — please retry."
      />,
    );

    expect(
      screen.getByTestId("simulation.tweak.error_state"),
    ).toHaveTextContent(/tweak generation failed/i);
    // The previously displayed revision is still rendered.
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
  });

  it("shows the rejection reason and retires the controls once rejected", () => {
    const rejectedRun: ProductionRun = {
      ...completedRun,
      status: RunStatus.halted,
    };
    render(
      <RunDetail
        run={rejectedRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={{
          decision: RunDecision.rejected,
          rejectionReason: "Tone is off.",
        }}
        onSubmitTweak={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByTestId("simulation.decision.reason")).toHaveTextContent(
      "Tone is off.",
    );
    // Rejecting sets the run status to halted, so the proceed controls retire.
    expect(
      screen.queryByTestId("simulation.accept_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("simulation.reject_button"),
    ).not.toBeInTheDocument();
    // A manual rejection is not a pipeline halt, so no violation card.
    expect(
      screen.queryByTestId("simulation.halt_reason.card"),
    ).not.toBeInTheDocument();
  });

  it("shows the approved decision badge and retires the controls", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision, tweakedRevision]}
        decision={{ decision: RunDecision.approved, acceptedRevision: 2n }}
        onSubmitTweak={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.proceed.decided_state"),
    ).toHaveTextContent(/approved at v2/i);
    expect(
      screen.queryByTestId("simulation.accept_button"),
    ).not.toBeInTheDocument();
  });

  it("offers next-step actions in the outcome panel for an approved run", async () => {
    const user = userEvent.setup();
    const onAdvanceStage = vi.fn();
    const onReturnToFeed = vi.fn();
    render(
      <RunDetail
        run={completedRun}
        ingredients={ingredients}
        revisions={[originalRevision, tweakedRevision]}
        decision={{ decision: RunDecision.approved, acceptedRevision: 2n }}
        onSubmitTweak={vi.fn()}
        onAdvanceStage={onAdvanceStage}
        onReturnToFeed={onReturnToFeed}
      />,
    );

    const outcome = screen.getByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run approved/i);

    await user.click(screen.getByTestId("simulation.advance_stage_button"));
    expect(onAdvanceStage).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("simulation.return_to_feed_button"));
    expect(onReturnToFeed).toHaveBeenCalledTimes(1);
  });

  it("offers only the return-to-feed action for a rejected run", () => {
    const rejectedRun: ProductionRun = {
      ...completedRun,
      status: RunStatus.halted,
    };
    render(
      <RunDetail
        run={rejectedRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={{
          decision: RunDecision.rejected,
          rejectionReason: "Tone is off.",
        }}
        onSubmitTweak={vi.fn()}
        onAdvanceStage={vi.fn()}
        onReturnToFeed={vi.fn()}
      />,
    );

    const outcome = screen.getByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run rejected/i);
    expect(
      screen.queryByTestId("simulation.advance_stage_button"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.return_to_feed_button"),
    ).toBeInTheDocument();
  });

  it("does not offer tweak or proceed controls for an in-progress run", () => {
    const runningRun: ProductionRun = {
      ...completedRun,
      status: RunStatus.running,
    };
    render(
      <RunDetail
        run={runningRun}
        ingredients={ingredients}
        revisions={[originalRevision]}
        decision={{ decision: RunDecision.in_progress }}
        onSubmitTweak={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("simulation.tweak.section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("simulation.proceed.section"),
    ).not.toBeInTheDocument();
  });
});
