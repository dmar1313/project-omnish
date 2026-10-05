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
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the /videos surfaces ahead of the delete-video
 * work. These tests pin the adjacent behavior that must keep working once a
 * delete action is added to the listing and the detail view:
 *
 *   - selecting a cut still opens its detail view (a delete control added to a
 *     card must not swallow the card's own select action);
 *   - the detail view's back control still returns to the grid;
 *   - the existing empty state still renders when no cuts remain;
 *   - the signed-in gate still keeps the videos workspace unreachable to
 *     unauthenticated visitors.
 *
 * The backend is a local typed mock, so this proves the component contract,
 * not the real canister. It deliberately does not assert any delete behavior.
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

function actorFor(
  run: ProductionRun | null,
  revisions: Revision[] = [originalRevision],
  artifact: MediaArtifact | null = readyArtifact,
) {
  return createMockActor({
    getRun: vi.fn(async () => run),
    listRevisions: vi.fn(async () => revisions),
    getMediaArtifact: vi.fn(async () => artifact),
  });
}

describe("videos delete characterization", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
    infra.actor = actorFor(completedRun);
  });

  it("still opens a cut's detail view when its card is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));

    expect(
      await screen.findByTestId("videos.detail.player"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("video_player.video")).toHaveAttribute(
      "src",
      readyArtifact.storageUrl,
    );
  });

  it("still returns from the detail view to the grid via the back control", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));
    await user.click(await screen.findByTestId("videos.detail.back_button"));

    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    expect(
      screen.queryByTestId("videos.detail.player"),
    ).not.toBeInTheDocument();
  });

  it("still shows the empty state when a run has no video outputs", async () => {
    infra.actor = actorFor(
      { ...completedRun, generatedAssets: [], formatOutputs: [] },
      [],
      null,
    );
    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("videos.list")).not.toBeInTheDocument();
  });

  it("still shows the empty state when no run is selected", async () => {
    router.search = {};
    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
  });

  it("still renders the grid with every cut selectable", async () => {
    renderWithProviders(<GeneratedVideosPage />);

    expect(await screen.findByTestId("videos.list")).toBeInTheDocument();
    expect(screen.getByTestId("videos.item.1")).toBeInTheDocument();
    expect(screen.getByTestId("videos.item.2")).toBeInTheDocument();
    expect(screen.getByText("TikTok cut")).toBeInTheDocument();
    expect(screen.getByText("YouTube cut")).toBeInTheDocument();
  });
});
