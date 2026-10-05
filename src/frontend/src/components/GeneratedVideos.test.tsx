import {
  AgentKind,
  type ProductionRun,
  type Revision,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import {
  GeneratedVideos,
  GeneratedVideosEmptyState,
  deriveVideoOutputs,
  formatDuration,
} from "@/components/GeneratedVideos";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Pure derivation + rendering contract for the Generated Videos grid. The
 * backend is not involved: `deriveVideoOutputs` turns a run's adapted formats
 * (or its visual output) into the cuts the operator sees.
 */

const run: ProductionRun = {
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

describe("deriveVideoOutputs", () => {
  it("derives one cut per adapted platform format", () => {
    const videos = deriveVideoOutputs(run);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      platform: "TikTok",
      aspectRatio: "9:16",
      script: "Short-form adaptation.",
      continuityNotes: "Continuity notes.",
    });
    expect(videos[1]).toMatchObject({
      platform: "YouTube",
      aspectRatio: "16:9",
    });
  });

  it("falls back to a single master cut from the visual output", () => {
    const videos = deriveVideoOutputs({ ...run, formatOutputs: [] });
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      id: "master-cut",
      platform: "Master",
      script: "Visual prompt text.",
    });
  });

  it("returns no cuts when there are neither formats nor a visual output", () => {
    expect(
      deriveVideoOutputs({ ...run, formatOutputs: [], generatedAssets: [] }),
    ).toEqual([]);
  });

  it("prefers a revision's outputs over the run's", () => {
    const revision: Revision = {
      revisionNumber: 2n,
      instruction: "Make the ending warmer.",
      generatedAssets: run.generatedAssets,
      formatOutputs: [
        {
          platform: "TikTok",
          aspectRatio: "9:16",
          characterLimit: 2200n,
          content: "Warmer short-form adaptation.",
        },
      ],
      tokenCostBurn: 5100,
      timestamp: 1_700_000_100_000_000_000n,
    };

    const videos = deriveVideoOutputs(run, revision);
    expect(videos).toHaveLength(1);
    expect(videos[0].script).toBe("Warmer short-form adaptation.");
  });

  it("formats a duration as minutes and zero-padded seconds", () => {
    expect(formatDuration(8)).toBe("0:08");
    expect(formatDuration(75)).toBe("1:15");
  });
});

describe("GeneratedVideos", () => {
  it("renders a selectable card per cut", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <GeneratedVideos videos={deriveVideoOutputs(run)} onSelect={onSelect} />,
    );

    expect(screen.getByTestId("videos.list")).toBeInTheDocument();
    await user.click(screen.getByTestId("videos.item.1"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "TikTok" }),
    );
  });

  it("renders the provided empty state when there are no cuts", () => {
    render(
      <GeneratedVideos
        videos={[]}
        onSelect={vi.fn()}
        emptyState={<GeneratedVideosEmptyState onStartRun={vi.fn()} />}
      />,
    );

    expect(screen.getByTestId("videos.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("videos.list")).not.toBeInTheDocument();
  });
});
