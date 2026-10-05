import {
  AgentKind,
  type MediaArtifact,
  MediaArtifactStatus,
  type ProductionRun,
  type Revision,
  RunDecision,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import { deriveVideoOutputs } from "@/components/GeneratedVideos";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the ready-video rendering path when the
 * artifact is only mirrored on the run record.
 *
 * The accepted behavior: once a video generation reaches a ready state, the app
 * renders the video for the user. The backend keeps the authoritative artifact
 * in its `mediaArtifacts` map and also mirrors it on the run record
 * (`run.mediaArtifact`); `getMediaArtifact` falls back to that mirror when the
 * map has no entry. The Generated Videos page mirrors that fallback
 * (`artifactQuery.data ?? run?.mediaArtifact`), so a ready video must still
 * render when the artifact read returns nothing but the run carries the
 * artifact.
 *
 * These tests pin that adjacent fallback behavior, which the existing
 * settle/return tests do not exercise (they always supply the artifact through
 * `getMediaArtifact`). They deliberately do NOT pin the generating lifecycle or
 * the polling cadence, which the request intentionally changes.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * media read/attach methods.
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

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
};

/**
 * A completed run whose video is ready and whose artifact is mirrored on the
 * run record, exactly as `attachArtifact` writes it. `getMediaArtifact` is
 * deliberately left returning null in the page tests below, so the only way the
 * video can render is through the run's mirrored artifact.
 */
const runWithMirroredArtifact: ProductionRun = {
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
  videoStatus: VideoOutputStatus.ready,
  mediaArtifact: readyArtifact,
};

const originalRevision: Revision = {
  revisionNumber: 1n,
  generatedAssets: runWithMirroredArtifact.generatedAssets,
  formatOutputs: runWithMirroredArtifact.formatOutputs,
  tokenCostBurn: runWithMirroredArtifact.tokenCostBurn,
  timestamp: runWithMirroredArtifact.timestamp,
};

describe("deriveVideoOutputs mirrored-artifact fallback", () => {
  it("renders a ready cut from the run's mirrored artifact when no artifact argument is passed", () => {
    const videos = deriveVideoOutputs(runWithMirroredArtifact);

    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video.mediaUrl).toBe(readyArtifact.storageUrl);
      expect(video.videoStatus).toBe(VideoOutputStatus.ready);
      expect(video.durationSeconds).toBe(readyArtifact.durationSeconds);
    }
  });

  it("prefers an explicitly passed artifact over the run's mirror", () => {
    const replacement: MediaArtifact = {
      ...readyArtifact,
      storageUrl: "https://storage.example/run-7-replacement.mp4",
      durationSeconds: 18,
    };

    const videos = deriveVideoOutputs(
      runWithMirroredArtifact,
      null,
      replacement,
    );

    expect(videos[0].mediaUrl).toBe(replacement.storageUrl);
    expect(videos[0].durationSeconds).toBe(18);
  });
});

describe("GeneratedVideosPage mirrored-artifact fallback", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("renders the ready video from the run's mirrored artifact when the artifact read returns nothing", async () => {
    infra.actor = createMockActor({
      getRun: vi.fn(async () => runWithMirroredArtifact),
      listRevisions: vi.fn(async () => [originalRevision]),
      // The authoritative map has no entry; the run record carries the mirror.
      getMediaArtifact: vi.fn(async () => null),
      getVideoGeneration: vi.fn(async () => null),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });

    const { container } = renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");

    // The ready video is rendered from the run's mirrored artifact, not lost.
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    }
    expect(screen.queryByText("No video produced")).not.toBeInTheDocument();
  });

  it("plays the mirrored artifact in the detail view when a cut is selected", async () => {
    const user = userEvent.setup();
    infra.actor = createMockActor({
      getRun: vi.fn(async () => runWithMirroredArtifact),
      listRevisions: vi.fn(async () => [originalRevision]),
      getMediaArtifact: vi.fn(async () => null),
      getVideoGeneration: vi.fn(async () => null),
      getRunDecision: vi.fn(async () => ({ decision: RunDecision.approved })),
    });

    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    const video = await screen.findByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();
  });
});
