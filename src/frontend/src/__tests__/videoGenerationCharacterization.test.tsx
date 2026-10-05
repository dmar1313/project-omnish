import {
  AgentKind,
  type MediaArtifact,
  MediaArtifactStatus,
  type ProductionRun,
  type Revision,
  RunDecision,
  type RunDecisionState,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import { deriveVideoOutputs } from "@/components/GeneratedVideos";
import { RunDetail } from "@/components/RunDetail";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the review step and the video-output
 * derivation, ahead of the external video-generation work.
 *
 * The request intentionally changes the video-output lifecycle: accepted runs
 * will be sent to Replicate and settle to `#ready` with a generated artifact,
 * and the review step will gain a Generate Videos action. These tests
 * deliberately do NOT pin the current "no_result unless uploaded" lifecycle or
 * any generation control. They pin the adjacent behavior that must keep working
 * once generation is introduced:
 *
 *   - the completed, undecided review step still renders its produced-video
 *     surface alongside the existing Accept/Reject/Continue controls, so adding
 *     a Generate action must not displace either;
 *   - the approved outcome panel still reports the approval and keeps its
 *     existing next-step actions;
 *   - `deriveVideoOutputs` still maps a revision's format outputs to one cut
 *     each, falls back to a single master cut when only a visual output exists,
 *     and returns nothing when there is neither a visual output nor media.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * backend methods.
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
    {
      platform: "YouTube",
      aspectRatio: "16:9",
      characterLimit: 5000n,
      content: "Long-form adaptation.",
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

const completedDecision: RunDecisionState = {
  decision: RunDecision.completed,
};

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
};

describe("review step characterization", () => {
  it("renders the produced-video surface alongside the proceed controls for a completed, undecided run", () => {
    render(
      <RunDetail
        run={completedRun}
        ingredients={[]}
        revisions={[originalRevision]}
        decision={completedDecision}
        onSubmitTweak={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onContinue={vi.fn()}
        mediaSlot={<div data-ocid="produced-video-slot">Produced video</div>}
      />,
    );

    // The review step shows the produced-video surface and the existing
    // proceed controls together; a new Generate action must be additive.
    expect(screen.getByTestId("produced-video-slot")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.proceed.section"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("simulation.accept_button")).toBeInTheDocument();
    expect(screen.getByTestId("simulation.reject_button")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.continue_button"),
    ).toBeInTheDocument();
    // The reasoning trail is still present, not replaced by the media surface.
    expect(
      screen.getByTestId("simulation.agent_outputs.section"),
    ).toBeInTheDocument();
    expect(screen.getByText("Writer draft text.")).toBeInTheDocument();
  });

  it("keeps the approved outcome panel and its next-step actions intact", async () => {
    const user = userEvent.setup();
    const onAdvanceStage = vi.fn();
    const onReturnToFeed = vi.fn();
    render(
      <RunDetail
        run={completedRun}
        ingredients={[]}
        revisions={[originalRevision]}
        decision={{ decision: RunDecision.approved, acceptedRevision: 1n }}
        onAdvanceStage={onAdvanceStage}
        onReturnToFeed={onReturnToFeed}
      />,
    );

    const outcome = screen.getByTestId("simulation.outcome.section");
    expect(outcome).toHaveTextContent(/run approved/i);
    // The proceed controls retire once decided.
    expect(
      screen.queryByTestId("simulation.accept_button"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("simulation.advance_stage_button"));
    expect(onAdvanceStage).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("simulation.return_to_feed_button"));
    expect(onReturnToFeed).toHaveBeenCalledTimes(1);
  });
});

describe("deriveVideoOutputs mapping contract", () => {
  it("maps each format output to one cut sharing the run's artifact", () => {
    const videos = deriveVideoOutputs(
      completedRun,
      originalRevision,
      readyArtifact,
    );

    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.platform)).toEqual([
      "TikTok",
      "YouTube",
    ]);
    for (const video of videos) {
      expect(video.mediaUrl).toBe(readyArtifact.storageUrl);
      expect(video.videoStatus).toBe(VideoOutputStatus.ready);
      expect(video.durationSeconds).toBe(readyArtifact.durationSeconds);
    }
    // Each cut carries its own script and the shared continuity notes.
    expect(videos[0].script).toBe("Short-form adaptation.");
    expect(videos[1].script).toBe("Long-form adaptation.");
    expect(videos[0].continuityNotes).toBe("Continuity notes.");
  });

  it("falls back to a single master cut when only a visual output exists", () => {
    const run: ProductionRun = {
      ...completedRun,
      formatOutputs: [],
      generatedAssets: [
        { agent: AgentKind.visual, content: "Visual prompt text." },
      ],
    };

    const videos = deriveVideoOutputs(run, null, readyArtifact);

    expect(videos).toHaveLength(1);
    expect(videos[0].id).toBe("master-cut");
    expect(videos[0].platform).toBe("Master");
    expect(videos[0].script).toBe("Visual prompt text.");
    expect(videos[0].mediaUrl).toBe(readyArtifact.storageUrl);
  });

  it("returns no cuts when there is neither a visual output nor media", () => {
    const run: ProductionRun = {
      ...completedRun,
      formatOutputs: [],
      generatedAssets: [
        { agent: AgentKind.writer, content: "Writer draft text." },
      ],
    };

    expect(deriveVideoOutputs(run, null, null)).toEqual([]);
  });
});
