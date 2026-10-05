import {
  AgentKind,
  type MediaArtifact,
  MediaArtifactStatus,
  type ProductionRun,
  type Revision,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import {
  GeneratedVideos,
  deriveVideoOutputs,
} from "@/components/GeneratedVideos";
import { VideoDetail } from "@/components/VideoDetail";
import { VideoPlayer } from "@/components/VideoPlayer";
import { isVideoGenerating, videoStatusMeta } from "@/lib/status";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the generating-state work on the /videos surfaces.
 *
 * The accepted behavior: a run that is still pending/running (or whose video
 * output the backend reports as #generating) must show a visible generating
 * state for each cut, never an immediate final "No video produced". The
 * generating state resolves to a final state only once processing completes:
 * a real attached artifact makes the cut playable, and a finished run with no
 * artifact is the honest no-result.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * media read/attach/delete methods and the run's videoStatus field.
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
  status: RunStatus.running,
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
  videoStatus: VideoOutputStatus.generating,
};

const originalRevision: Revision = {
  revisionNumber: 1n,
  generatedAssets: baseRun.generatedAssets,
  formatOutputs: baseRun.formatOutputs,
  tokenCostBurn: baseRun.tokenCostBurn,
  timestamp: baseRun.timestamp,
};

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
};

/**
 * A mock whose run/artifact reads reflect attach/delete writes, so the page's
 * invalidated queries observe the same state a real canister would expose.
 * `setRun` lets a test advance the run's lifecycle (e.g. running -> completed)
 * on the same actor instance, which is what a refetch would observe.
 */
function actorWithMutableState(
  run: ProductionRun,
  initialArtifact: MediaArtifact | null,
) {
  let currentRun = run;
  let artifact = initialArtifact;
  const actor = createMockActor({
    getRun: vi.fn(async () => currentRun),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => artifact),
    attachMediaArtifact: vi.fn(async () => {
      artifact = readyArtifact;
      return currentRun;
    }),
    deleteMediaArtifact: vi.fn(async () => {
      const existed = artifact !== null;
      artifact = null;
      return existed;
    }),
  });
  return Object.assign(actor, {
    setRun: (next: ProductionRun) => {
      currentRun = next;
    },
  });
}

describe("isVideoGenerating", () => {
  it("is true while the run is pending or running, regardless of videoStatus", () => {
    expect(
      isVideoGenerating(RunStatus.pending, VideoOutputStatus.no_result),
    ).toBe(true);
    expect(
      isVideoGenerating(RunStatus.running, VideoOutputStatus.no_result),
    ).toBe(true);
  });

  it("is true when the backend reports the video output as generating", () => {
    expect(
      isVideoGenerating(RunStatus.completed, VideoOutputStatus.generating),
    ).toBe(true);
  });

  it("is false once a terminal run has a final video status", () => {
    expect(
      isVideoGenerating(RunStatus.completed, VideoOutputStatus.no_result),
    ).toBe(false);
    expect(
      isVideoGenerating(RunStatus.completed, VideoOutputStatus.ready),
    ).toBe(false);
    expect(
      isVideoGenerating(RunStatus.halted, VideoOutputStatus.no_result),
    ).toBe(false);
    expect(isVideoGenerating(RunStatus.failed, null)).toBe(false);
  });

  it("labels the generating video status", () => {
    expect(videoStatusMeta(VideoOutputStatus.generating)).toEqual({
      label: "Generating",
      tone: "running",
    });
  });
});

describe("deriveVideoOutputs generating state", () => {
  it("marks every cut generating for a pending run with no artifact", () => {
    const videos = deriveVideoOutputs({
      ...baseRun,
      status: RunStatus.pending,
      videoStatus: VideoOutputStatus.generating,
    });
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video.mediaUrl).toBeNull();
      expect(video.videoStatus).toBe(VideoOutputStatus.generating);
    }
  });

  it("marks cuts generating while the backend reports a revision is generating", () => {
    const videos = deriveVideoOutputs({
      ...baseRun,
      status: RunStatus.completed,
      videoStatus: VideoOutputStatus.generating,
    });
    expect(
      videos.every((v) => v.videoStatus === VideoOutputStatus.generating),
    ).toBe(true);
  });

  it("resolves to no_result only once a terminal run has no artifact", () => {
    const videos = deriveVideoOutputs({
      ...baseRun,
      status: RunStatus.completed,
      videoStatus: VideoOutputStatus.no_result,
    });
    expect(
      videos.every((v) => v.videoStatus === VideoOutputStatus.no_result),
    ).toBe(true);
  });

  it("lets a real attached artifact override the generating state", () => {
    const videos = deriveVideoOutputs(
      { ...baseRun, status: RunStatus.running },
      null,
      readyArtifact,
    );
    expect(videos.every((v) => v.videoStatus === VideoOutputStatus.ready)).toBe(
      true,
    );
    expect(videos.every((v) => v.mediaUrl === readyArtifact.storageUrl)).toBe(
      true,
    );
  });
});

describe("GeneratedVideos generating indicator", () => {
  const generatingVideos = deriveVideoOutputs(baseRun);

  it("shows a per-cut generating indicator instead of a no-result card", () => {
    render(<GeneratedVideos videos={generatingVideos} onSelect={vi.fn()} />);

    expect(screen.getByTestId("videos.generating_state.1")).toBeInTheDocument();
    expect(screen.getByTestId("videos.generating_state.2")).toBeInTheDocument();
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("shows the no-result card only for a terminal cut with no media", () => {
    const noResult = deriveVideoOutputs({
      ...baseRun,
      status: RunStatus.completed,
      videoStatus: VideoOutputStatus.no_result,
    });
    render(<GeneratedVideos videos={noResult} onSelect={vi.fn()} />);

    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
    expect(
      screen.queryByTestId("videos.generating_state.1"),
    ).not.toBeInTheDocument();
  });
});

describe("VideoPlayer generating state", () => {
  it("shows the generating state in place of the player while a cut is generating", () => {
    render(
      <VideoPlayer
        src={null}
        title="TikTok cut"
        generating
        aspectRatio="9:16"
      />,
    );

    expect(
      screen.getByTestId("video_player.generating_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
  });

  it("shows the honest empty state once generation has finished without a result", () => {
    render(<VideoPlayer src={null} title="TikTok cut" generating={false} />);

    expect(screen.getByTestId("video_player.empty_state")).toBeInTheDocument();
    expect(
      screen.queryByTestId("video_player.generating_state"),
    ).not.toBeInTheDocument();
  });
});

describe("VideoDetail generating state", () => {
  const generatingVideo = deriveVideoOutputs(baseRun)[0];

  it("shows a generating state in place of the player while the cut is generating", () => {
    render(<VideoDetail video={generatingVideo} onBack={vi.fn()} />);

    expect(
      screen.getByTestId("video_player.generating_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
    // The script and notes remain readable while the cut is still producing.
    expect(
      screen.getByTestId("videos.detail.script.section"),
    ).toHaveTextContent("Short-form adaptation.");
  });
});

describe("GeneratedVideosPage generating journey", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
    infra.actor = actorWithMutableState(baseRun, null);
  });

  it("shows generating indicators for a running run's cuts, not no-result cards", async () => {
    renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");

    expect(screen.getByTestId("videos.generating_state.1")).toBeInTheDocument();
    expect(screen.getByTestId("videos.generating_state.2")).toBeInTheDocument();
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("keeps the generating state while the run is pending or running", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableState(baseRun, null);
    infra.actor = actor;
    renderWithProviders(<GeneratedVideosPage />);
    await screen.findByTestId("videos.list");
    expect(screen.getByTestId("videos.generating_state.1")).toBeInTheDocument();

    // A pending run is still generating.
    actor.setRun({ ...baseRun, status: RunStatus.pending });
    await user.click(screen.getByTestId("videos.refresh_button"));

    await waitFor(() => {
      expect(
        screen.getByTestId("videos.generating_state.1"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("resolves to the honest no-result state once the run finishes without media", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableState(baseRun, null);
    infra.actor = actor;
    renderWithProviders(<GeneratedVideosPage />);
    await screen.findByTestId("videos.list");
    expect(screen.getByTestId("videos.generating_state.1")).toBeInTheDocument();

    // Processing completed with no artifact: the final state is no-result.
    actor.setRun({
      ...baseRun,
      status: RunStatus.completed,
      videoStatus: VideoOutputStatus.no_result,
    });
    await user.click(screen.getByTestId("videos.refresh_button"));

    await waitFor(() => {
      expect(screen.getAllByText("No video produced").length).toBeGreaterThan(
        0,
      );
    });
    expect(
      screen.queryByTestId("videos.generating_state.1"),
    ).not.toBeInTheDocument();
  });

  it("opens the detail view with a generating state while the cut is generating", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    expect(
      await screen.findByTestId("video_player.generating_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
  });

  it("overrides the generating state with a playable video once an artifact is attached", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableState(baseRun, null);
    infra.actor = actor;
    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    expect(screen.getByTestId("videos.generating_state.1")).toBeInTheDocument();

    // Attaching a real artifact (as the Simulation Inspector does) makes the
    // cuts playable on the next read, overriding the generating state.
    await actor.attachMediaArtifact({
      runId: 7n,
      storageUrl: readyArtifact.storageUrl,
      mimeType: readyArtifact.mimeType,
      durationSeconds: readyArtifact.durationSeconds,
      aspectRatio: readyArtifact.aspectRatio,
      cameoId: undefined,
    });
    await user.click(screen.getByTestId("videos.refresh_button"));

    await waitFor(() => {
      expect(container.querySelectorAll("video")).toHaveLength(2);
    });
    expect(
      screen.queryByTestId("videos.generating_state.1"),
    ).not.toBeInTheDocument();
  });

  it("returns a cut to its honest no-result state after its artifact is deleted", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableState(
      {
        ...baseRun,
        status: RunStatus.completed,
        videoStatus: VideoOutputStatus.ready,
      },
      readyArtifact,
    );
    infra.actor = actor;
    renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    await user.click(screen.getByTestId("videos.delete_button.1"));
    await user.click(await screen.findByTestId("videos.delete_confirm_button"));

    await waitFor(() => {
      expect(actor.deleteMediaArtifact).toHaveBeenCalledWith(7n);
    });

    // The deleted video drops out and the honest empty state takes over; the
    // run itself is untouched and still identified on the page.
    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("videos.list")).not.toBeInTheDocument();
    expect(screen.getByText("Run #7")).toBeInTheDocument();
  });
});
