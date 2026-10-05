import {
  AgentKind,
  type MediaArtifact,
  MediaArtifactStatus,
  type ProductionRun,
  type Revision,
  RunStatus,
  VideoOutputStatus,
} from "@/backend";
import { GeneratedVideos } from "@/components/GeneratedVideos";
import { VideoDetail } from "@/components/VideoDetail";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the delete-video feature on the /videos surfaces.
 *
 * These tests exercise the accepted behavior end to end across the real
 * components and providers: a delete action on each grid card and on the detail
 * view, a confirmation prompt that must be accepted before anything is removed,
 * cancellation leaving the video intact, the deleted video dropping out of the
 * grid/detail, and the empty state taking over once nothing remains.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * `deleteMediaArtifact` method.
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
  // The backend removes the artifact on delete, so the read path must reflect
  // that: once deleteMediaArtifact has run, getMediaArtifact resolves absent.
  let deleted = false;
  return createMockActor({
    getRun: vi.fn(async () => run),
    listRevisions: vi.fn(async () => revisions),
    getMediaArtifact: vi.fn(async () => (deleted ? null : artifact)),
    deleteMediaArtifact: vi.fn(async () => {
      deleted = true;
      return true;
    }),
  });
}

describe("GeneratedVideos delete action", () => {
  const videos = [
    {
      id: "TikTok-0",
      title: "TikTok cut",
      platform: "TikTok",
      aspectRatio: "9:16",
      durationSeconds: 42,
      mediaUrl: "https://storage.example/run-7.mp4",
      videoStatus: VideoOutputStatus.ready,
      script: "Short-form adaptation.",
      continuityNotes: "Continuity notes.",
    },
    {
      id: "YouTube-1",
      title: "YouTube cut",
      platform: "YouTube",
      aspectRatio: "16:9",
      durationSeconds: 42,
      mediaUrl: "https://storage.example/run-7.mp4",
      videoStatus: VideoOutputStatus.ready,
      script: "Long-form adaptation.",
      continuityNotes: "Continuity notes.",
    },
  ];

  it("exposes a delete action per card and confirms before removing", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => true);
    render(
      <GeneratedVideos
        videos={videos}
        onSelect={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByTestId("videos.delete_button.1")).toBeInTheDocument();
    expect(screen.getByTestId("videos.delete_button.2")).toBeInTheDocument();

    await user.click(screen.getByTestId("videos.delete_button.1"));

    // The confirmation names the cut and nothing has been deleted yet.
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /delete video/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("TikTok cut")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("videos.delete_confirm_button"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: "TikTok-0" }),
      );
    });
  });

  it("leaves the video intact when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => true);
    render(
      <GeneratedVideos
        videos={videos}
        onSelect={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByTestId("videos.delete_button.1"));
    await user.click(await screen.findByTestId("videos.delete_cancel_button"));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId("videos.item.1")).toBeInTheDocument();
  });

  it("surfaces a delete failure without removing the card", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => {
      throw new Error("backend unavailable");
    });
    render(
      <GeneratedVideos
        videos={videos}
        onSelect={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByTestId("videos.delete_button.1"));
    await user.click(await screen.findByTestId("videos.delete_confirm_button"));

    expect(await screen.findByTestId("videos.delete_error")).toHaveTextContent(
      "backend unavailable",
    );
    expect(screen.getByTestId("videos.item.1")).toBeInTheDocument();
  });

  it("shows no delete action when the caller cannot delete", () => {
    render(<GeneratedVideos videos={videos} onSelect={vi.fn()} />);

    expect(
      screen.queryByTestId("videos.delete_button.1"),
    ).not.toBeInTheDocument();
  });
});

describe("VideoDetail delete action", () => {
  const video = {
    id: "TikTok-0",
    title: "TikTok cut",
    platform: "TikTok",
    aspectRatio: "9:16",
    durationSeconds: 42,
    mediaUrl: "https://storage.example/run-7.mp4",
    videoStatus: VideoOutputStatus.ready,
    script: "Short-form adaptation.",
    continuityNotes: "Continuity notes.",
  };

  it("confirms before deleting and returns to the grid on success", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => true);
    const onBack = vi.fn();
    render(<VideoDetail video={video} onBack={onBack} onDelete={onDelete} />);

    await user.click(screen.getByTestId("videos.detail.delete_button"));
    expect(
      await screen.findByRole("heading", { name: /delete video/i }),
    ).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("videos.detail.delete_confirm_button"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: "TikTok-0" }),
      );
    });
    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  it("leaves the video intact when the detail confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => true);
    const onBack = vi.fn();
    render(<VideoDetail video={video} onBack={onBack} onDelete={onDelete} />);

    await user.click(screen.getByTestId("videos.detail.delete_button"));
    await user.click(
      await screen.findByTestId("videos.detail.delete_cancel_button"),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("videos.detail.player")).toBeInTheDocument();
  });

  it("surfaces a delete failure and stays on the detail view", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => {
      throw new Error("delete rejected");
    });
    const onBack = vi.fn();
    render(<VideoDetail video={video} onBack={onBack} onDelete={onDelete} />);

    await user.click(screen.getByTestId("videos.detail.delete_button"));
    await user.click(
      await screen.findByTestId("videos.detail.delete_confirm_button"),
    );

    expect(
      await screen.findByTestId("videos.detail.delete_error"),
    ).toHaveTextContent("delete rejected");
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("GeneratedVideosPage delete journey", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
    infra.actor = actorFor(completedRun);
  });

  it("deletes a video from the listing and drops it from the grid", async () => {
    const user = userEvent.setup();
    const actor = actorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    await user.click(screen.getByTestId("videos.delete_button.1"));
    await user.click(await screen.findByTestId("videos.delete_confirm_button"));

    await waitFor(() => {
      expect(actor.deleteMediaArtifact).toHaveBeenCalledWith(7n);
    });
    // The deleted run's artifact-less cuts are suppressed, so the grid empties
    // and the honest empty state takes over.
    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("videos.list")).not.toBeInTheDocument();
  });

  it("deletes the currently viewed video from the detail view and returns to the listing", async () => {
    const user = userEvent.setup();
    const actor = actorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<GeneratedVideosPage />);

    await user.click(await screen.findByTestId("videos.item.1"));
    await screen.findByTestId("videos.detail.player");

    await user.click(screen.getByTestId("videos.detail.delete_button"));
    await user.click(
      await screen.findByTestId("videos.detail.delete_confirm_button"),
    );

    await waitFor(() => {
      expect(actor.deleteMediaArtifact).toHaveBeenCalledWith(7n);
    });
    // Back on the listing, with the deleted video gone and the empty state shown.
    expect(await screen.findByTestId("videos.empty_state")).toBeInTheDocument();
    expect(
      screen.queryByTestId("videos.detail.player"),
    ).not.toBeInTheDocument();
  });

  it("keeps the video when the listing confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const actor = actorFor(completedRun);
    infra.actor = actor;
    renderWithProviders(<GeneratedVideosPage />);

    await screen.findByTestId("videos.list");
    await user.click(screen.getByTestId("videos.delete_button.1"));
    await user.click(await screen.findByTestId("videos.delete_cancel_button"));

    expect(actor.deleteMediaArtifact).not.toHaveBeenCalled();
    expect(screen.getByTestId("videos.item.1")).toBeInTheDocument();
    expect(screen.getByTestId("videos.item.2")).toBeInTheDocument();
  });

  it("does not expose delete actions to an unauthenticated visitor", async () => {
    infra.isAuthenticated = false;
    renderWithProviders(<GeneratedVideosPage />);

    // The signed-in gate keeps the workspace unreachable, so no delete control
    // is rendered at all.
    expect(
      screen.queryByTestId("videos.delete_button.1"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("videos.list")).not.toBeInTheDocument();
  });
});
