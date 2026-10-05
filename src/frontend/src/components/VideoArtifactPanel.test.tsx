import type { CameoCapture, DnaRecord, MediaArtifact } from "@/backend";
import { MediaArtifactStatus } from "@/backend";
import { VideoArtifactPanel } from "@/components/VideoArtifactPanel";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Produced-video panel contract for the Simulation Inspector.
 *
 * The panel is the seam between a browser File and the backend's media
 * artifact: it uploads the file through platform storage, reads the real
 * duration/aspect ratio from the media, and attaches the resulting artifact to
 * the run. The backend actor and the storage upload are local mocks, so this
 * proves the component contract, not the real canister or object storage.
 */

const infra = vi.hoisted(() => ({
  actor: null as unknown,
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useInternetIdentity: () => ({
    isAuthenticated: true,
    isInitializing: false,
    identity: undefined,
    clear: vi.fn(),
    login: vi.fn(),
  }),
  useActor: () => ({ actor: infra.actor, isFetching: false }),
}));

const media = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
}));

vi.mock("@/lib/mediaCapture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mediaCapture")>();
  return { ...actual, uploadVideo: media.uploadVideo };
});

const character: DnaRecord = {
  id: 3n,
  characterName: "Marlow Quinn",
  identityBlocks: "A cartographer of dead stars.",
  immutableTraits: "Never removes the visor.",
  visualMarkers: "Amber visor, ash-grey coat.",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

const cameo: CameoCapture = {
  id: 5n,
  characterId: 3n,
  status: { complete: null } as unknown as CameoCapture["status"],
  frontAssetId: 11n,
  leftAssetId: 12n,
  rightAssetId: 13n,
  voiceAssetId: 14n,
  createdAt: 1_700_000_000_000_000_000n,
};

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
  characterId: 3n,
};

function makeVideoFile(name = "clip.mp4") {
  return new File([new Uint8Array([0, 1, 2, 3])], name, {
    type: "video/mp4",
  });
}

describe("VideoArtifactPanel", () => {
  beforeEach(() => {
    media.uploadVideo.mockReset();
    infra.actor = createMockActor();
  });

  it("shows an honest empty state and the platform capability notice when no artifact exists", () => {
    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={null}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    expect(
      screen.getByTestId("simulation.media.empty_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
    // The app states in-product that AI photorealistic cameo video is not
    // available on this platform.
    expect(screen.getByTestId("simulation.media.notice")).toHaveTextContent(
      /does not generate photorealistic cameo video with AI/i,
    );
    // The character the run is built from is identified.
    expect(screen.getByText(/built from Marlow Quinn/i)).toBeInTheDocument();
  });

  it("plays an attached artifact through a real <video> element", () => {
    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={readyArtifact}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    const video = screen.getByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", readyArtifact.storageUrl);
    expect(video).toHaveAttribute("controls");
    expect(
      screen.queryByTestId("simulation.media.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("uploads a video file through platform storage and attaches it to the run", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => null),
    });
    infra.actor = actor;
    media.uploadVideo.mockResolvedValue({
      storageUrl: "https://storage.example/uploaded.mp4",
      mimeType: "video/mp4",
      durationSeconds: 12.5,
      aspectRatio: "16:9",
    });

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={null}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    const input = screen.getByTestId("simulation.media.file_input");
    await user.upload(input, makeVideoFile());

    await waitFor(() => {
      expect(media.uploadVideo).toHaveBeenCalledTimes(1);
    });
    // The artifact is persisted through the backend with the media-derived
    // metadata read from the uploaded file.
    await waitFor(() => {
      expect(actor.attachMediaArtifact).toHaveBeenCalledWith({
        runId: 7n,
        storageUrl: "https://storage.example/uploaded.mp4",
        mimeType: "video/mp4",
        durationSeconds: 12.5,
        aspectRatio: "16:9",
        cameoId: undefined,
      });
    });
  });

  it("attributes the uploaded footage to the selected cameo", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => null),
    });
    infra.actor = actor;
    media.uploadVideo.mockResolvedValue({
      storageUrl: "https://storage.example/uploaded.mp4",
      mimeType: "video/mp4",
      durationSeconds: 12.5,
      aspectRatio: "16:9",
    });

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={null}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    // Choose the cameo the footage should be attributed to.
    await user.click(screen.getByTestId("simulation.media.cameo_select"));
    await user.click(await screen.findByRole("option", { name: "Cameo #5" }));

    await user.upload(
      screen.getByTestId("simulation.media.file_input"),
      makeVideoFile(),
    );

    await waitFor(() => {
      expect(actor.attachMediaArtifact).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 7n, cameoId: 5n }),
      );
    });
  });

  it("reports upload progress while the transfer is in flight", async () => {
    const user = userEvent.setup();
    let resolveUpload: ((value: unknown) => void) | undefined;
    media.uploadVideo.mockImplementation(
      (_file: File, onProgress?: (pct: number) => void) =>
        new Promise((resolve) => {
          onProgress?.(40);
          resolveUpload = resolve;
        }),
    );

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={null}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    await user.upload(
      screen.getByTestId("simulation.media.file_input"),
      makeVideoFile(),
    );

    // The transfer feedback is visible while the upload is pending.
    expect(
      await screen.findByTestId("simulation.media.loading_state"),
    ).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();

    resolveUpload?.({
      storageUrl: "https://storage.example/uploaded.mp4",
      mimeType: "video/mp4",
      durationSeconds: 12.5,
      aspectRatio: "16:9",
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("simulation.media.loading_state"),
      ).not.toBeInTheDocument();
    });
  });

  it("confirms before deleting the attached artifact and calls the backend", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      deleteMediaArtifact: vi.fn(async () => true),
    });
    infra.actor = actor;

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={readyArtifact}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    await user.click(screen.getByTestId("simulation.media.delete_button"));
    // The confirmation appears and nothing is deleted until it is accepted.
    expect(
      await screen.findByRole("heading", { name: /delete video/i }),
    ).toBeInTheDocument();
    expect(actor.deleteMediaArtifact).not.toHaveBeenCalled();

    await user.click(
      screen.getByTestId("simulation.media.delete_confirm_button"),
    );

    await waitFor(() => {
      expect(actor.deleteMediaArtifact).toHaveBeenCalledWith(7n);
    });
  });

  it("leaves the artifact intact when the delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      deleteMediaArtifact: vi.fn(async () => true),
    });
    infra.actor = actor;

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={readyArtifact}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    await user.click(screen.getByTestId("simulation.media.delete_button"));
    await user.click(
      await screen.findByTestId("simulation.media.delete_cancel_button"),
    );

    expect(actor.deleteMediaArtifact).not.toHaveBeenCalled();
    expect(screen.getByTestId("video_player.video")).toBeInTheDocument();
  });

  it("surfaces an upload failure without attaching an artifact", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => null),
    });
    infra.actor = actor;
    media.uploadVideo.mockRejectedValue(new Error("storage unavailable"));

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={null}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    await user.upload(
      screen.getByTestId("simulation.media.file_input"),
      makeVideoFile(),
    );

    expect(
      await screen.findByTestId("simulation.media.error_state"),
    ).toHaveTextContent("storage unavailable");
    expect(actor.attachMediaArtifact).not.toHaveBeenCalled();
  });
});
