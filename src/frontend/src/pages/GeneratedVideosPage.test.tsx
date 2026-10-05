import {
  AgentKind,
  type MediaArtifact,
  MediaArtifactStatus,
  type ProductionRun,
  type Revision,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Generated Videos view: the end result of the prompt-to-videos flow. These
 * tests exercise the list, the detail view with its inline player, the empty
 * state, and the URL-preserved run/revision selection. The backend is a local
 * typed mock, so this proves the component contract, not the real canister.
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

const tweakedRevision: Revision = {
  revisionNumber: 2n,
  instruction: "Make the ending warmer.",
  generatedAssets: completedRun.generatedAssets,
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

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
};

function actorFor(
  run: ProductionRun | null,
  revisions: Revision[] = [originalRevision],
  artifact: MediaArtifact | null = null,
) {
  return createMockActor({
    getRun: vi.fn(async () => run),
    listRevisions: vi.fn(async () => revisions),
    getMediaArtifact: vi.fn(async () => artifact),
  });
}

describe("GeneratedVideosPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = {};
    router.navigate.mockReset();
    infra.actor = actorFor(completedRun);
  });

  it("lists the run's finished video outputs", async () => {
    router.search = { runId: "7" };
    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    expect(screen.getByText("TikTok cut")).toBeInTheDocument();
    expect(screen.getByText("YouTube cut")).toBeInTheDocument();
    expect(screen.getByTestId("videos.item.1")).toBeInTheDocument();
    expect(screen.getByTestId("videos.item.2")).toBeInTheDocument();
  });

  it("renders each cut as a real <video> element sourced from the run's artifact", async () => {
    router.search = { runId: "7" };
    infra.actor = actorFor(completedRun, [originalRevision], readyArtifact);
    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");

    // Every cut plays the run's real media file, not a static image.
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    }
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("shows an explicit no-video state and no placeholder image when the run has no artifact", async () => {
    router.search = { runId: "7" };
    infra.actor = actorFor(completedRun, [originalRevision], null);
    const { container } = renderWithProviders(<GeneratedVideosPage />);

    // The run has format outputs but no attached media, so each cut is shown
    // with an explicit "No video produced" state rather than a fake player or
    // a static image standing in for a video.
    await screen.findByTestId("videos.list");
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("states in-product that AI photorealistic cameo video is not available", async () => {
    router.search = { runId: "7" };
    renderWithProviders(<GeneratedVideosPage />);

    const notice = await screen.findByTestId("videos.capability_notice");
    expect(notice).toHaveTextContent(
      /does not generate photorealistic cameo video with AI/i,
    );
  });

  it("identifies the character and cameo the run's video was built from", async () => {
    router.search = { runId: "7" };
    infra.actor = createMockActor({
      getRun: vi.fn(async () => completedRun),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => readyArtifact),
      listDna: vi.fn(async () => [
        {
          id: 3n,
          characterName: "Marlow Quinn",
          identityBlocks: "A cartographer of dead stars.",
          immutableTraits: "Never removes the visor.",
          visualMarkers: "Amber visor, ash-grey coat.",
          activeVersion: 1n,
          createdAt: 1_700_000_000_000_000_000n,
        },
      ]),
      listCameos: vi.fn(async () => [
        {
          id: 5n,
          characterId: 3n,
          status: { complete: null },
          frontAssetId: 11n,
          leftAssetId: 12n,
          rightAssetId: 13n,
          voiceAssetId: 14n,
          createdAt: 1_700_000_000_000_000_000n,
        },
      ]),
    });
    renderWithProviders(<GeneratedVideosPage />);

    const context = await screen.findByTestId("videos.character_context");
    expect(context).toHaveTextContent(/built from Marlow Quinn/i);
    expect(context).toHaveTextContent(/cameo #5/i);
  });

  it("opens a detail view with a real inline video player when a video is selected", async () => {
    const user = userEvent.setup();
    router.search = { runId: "7" };
    infra.actor = actorFor(completedRun, [originalRevision], readyArtifact);
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    const player = await screen.findByTestId("videos.detail.player");
    expect(player).toBeInTheDocument();

    // The detail view plays the run's real media artifact through a native
    // HTML5 <video> element with standard controls — not a fake opacity toggle.
    const video = screen.getByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(video).toHaveAttribute("controls");
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByTestId("videos.detail.script.section"),
    ).toHaveTextContent("Short-form adaptation.");
    expect(
      screen.getByTestId("videos.detail.continuity.section"),
    ).toHaveTextContent("Continuity notes.");
  });

  it("shows an honest error state when an attached artifact fails to load", async () => {
    const user = userEvent.setup();
    router.search = { runId: "7" };
    infra.actor = actorFor(completedRun, [originalRevision], readyArtifact);
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    // The detail view mounts the real player, which reports a load failure.
    const video = await screen.findByTestId("video_player.video");
    fireEvent.error(video);

    expect(screen.getByTestId("video_player.error_state")).toHaveTextContent(
      /could not be loaded/i,
    );
    // The script and notes remain available even when the media is gone.
    expect(
      screen.getByTestId("videos.detail.script.section"),
    ).toHaveTextContent("Short-form adaptation.");
  });

  it("returns from the detail view to the video grid", async () => {
    const user = userEvent.setup();
    router.search = { runId: "7" };
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));
    await user.click(await screen.findByTestId("videos.detail.back_button"));

    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    expect(
      screen.queryByTestId("videos.detail.player"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state and links back to start a new run when no run is selected", async () => {
    const user = userEvent.setup();
    router.search = {};
    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    await user.click(screen.getByTestId("videos.start_run_button"));

    expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows the empty state for a completed run with no video outputs", async () => {
    router.search = { runId: "7" };
    infra.actor = actorFor(
      {
        ...completedRun,
        generatedAssets: [],
        formatOutputs: [],
      },
      [],
    );
    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("videos.list")).not.toBeInTheDocument();
  });

  it("restores the requested revision from the URL", async () => {
    router.search = { runId: "7", revision: "2" };
    infra.actor = actorFor(completedRun, [originalRevision, tweakedRevision]);
    renderWithProviders(<GeneratedVideosPage />);

    // The tweaked revision's single cut is shown, not the original's two.
    expect(await screen.findByText("TikTok cut")).toBeInTheDocument();
    expect(screen.queryByText("YouTube cut")).not.toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("shows the persistent stepper with Generated Videos as the current stage", async () => {
    router.search = { runId: "7" };
    renderWithProviders(<GeneratedVideosPage />);

    const stepper = await screen.findByTestId("flow.stepper");
    expect(stepper).toBeInTheDocument();
    expect(screen.getByTestId("flow.stepper.videos.tab")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("navigates back to the inspector for the run from the stepper", async () => {
    const user = userEvent.setup();
    router.search = { runId: "7" };
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("flow.stepper.simulation.tab"));

    await waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith({
        to: "/simulation",
        search: { runId: "7" },
      });
    });
  });
});
