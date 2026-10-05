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
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the /videos surfaces ahead of the
 * generating-state work.
 *
 * The request intentionally changes what a *pending or running* run shows: its
 * cuts must enter a visible generating state instead of resolving immediately
 * to "No video produced". These tests deliberately do NOT pin that behavior.
 * They pin the adjacent behavior that must keep working once the generating
 * state is introduced:
 *
 *   - a completed run with a real attached artifact still renders a playable
 *     <video> per cut, and the detail view still plays it;
 *   - a completed run that finished without a media result still shows the
 *     honest "No video produced" state (the terminal no-result case);
 *   - attaching a real artifact to a run overrides the no-result state and
 *     produces a playable video;
 *   - deleting a run's artifact returns its cuts to the honest no-result state
 *     without breaking the run (its header and script remain).
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * media read/attach/delete methods.
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

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
};

/**
 * A mock whose artifact read reflects attach/delete writes, so the page's
 * invalidated queries observe the same state a real canister would expose.
 */
function actorWithMutableArtifact(
  run: ProductionRun,
  initial: MediaArtifact | null,
) {
  let artifact = initial;
  return createMockActor({
    getRun: vi.fn(async () => run),
    listRevisions: vi.fn(async () => [originalRevision]),
    getMediaArtifact: vi.fn(async () => artifact),
    attachMediaArtifact: vi.fn(async () => {
      artifact = readyArtifact;
      return run;
    }),
    deleteMediaArtifact: vi.fn(async () => {
      const existed = artifact !== null;
      artifact = null;
      return existed;
    }),
  });
}

describe("videos generating-state characterization", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
    infra.actor = actorWithMutableArtifact(completedRun, readyArtifact);
  });

  it("renders a playable video per cut for a completed run with a real artifact", async () => {
    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");

    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    }
    // A real artifact means no cut falls back to the no-result state.
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("shows the honest no-result state for a completed run that produced no media", async () => {
    infra.actor = actorWithMutableArtifact(completedRun, null);
    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");

    // The run is terminal and has no artifact, so each cut honestly reports
    // that no video was produced rather than faking a player.
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("plays the run's artifact in the detail view when a cut is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    const player = await screen.findByTestId("videos.detail.player");
    expect(player).toBeInTheDocument();
    const video = screen.getByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("overrides the no-result state with a playable video once an artifact is attached", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableArtifact(completedRun, null);
    infra.actor = actor;
    const { container } = renderWithProviders(<GeneratedVideosPage />);

    // Before attaching, the completed run honestly reports no video.
    await screen.findByTestId("videos.list");
    expect(screen.getAllByText("No video produced").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("video")).toHaveLength(0);

    // Attaching a real artifact (as the Simulation Inspector does) makes the
    // cuts playable on the next read.
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
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("returns a cut to the honest no-result state after its artifact is deleted, without breaking the run", async () => {
    const user = userEvent.setup();
    const actor = actorWithMutableArtifact(completedRun, readyArtifact);
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
    expect(
      screen.getByText("Marlow crosses the Veil at dusk."),
    ).toBeInTheDocument();
  });

  it("keeps the run's script available in the detail view when its artifact is gone", async () => {
    const user = userEvent.setup();
    infra.actor = actorWithMutableArtifact(completedRun, null);
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    // With no artifact the player shows its honest empty state, but the cut's
    // script and continuity notes remain readable.
    expect(
      await screen.findByTestId("video_player.empty_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("videos.detail.script.section"),
    ).toHaveTextContent("Short-form adaptation.");
    expect(
      screen.getByTestId("videos.detail.continuity.section"),
    ).toHaveTextContent("Continuity notes.");
  });
});
