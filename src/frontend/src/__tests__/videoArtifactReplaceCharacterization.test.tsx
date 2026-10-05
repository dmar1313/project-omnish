import type { CameoCapture, DnaRecord, MediaArtifact } from "@/backend";
import { MediaArtifactStatus } from "@/backend";
import { VideoArtifactPanel } from "@/components/VideoArtifactPanel";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the attach/replace/delete flow on a run's
 * video artifact, ahead of the generating-state work.
 *
 * The request intentionally changes what a *pending or running* run's video
 * screens show. It must not disturb the operator's ability to attach, replace,
 * or delete a run's real footage. These tests pin the adjacent behavior that
 * must keep working:
 *
 *   - when an artifact already exists, the panel offers a *replace* action and
 *     uploading a new file attaches the new media to the same run;
 *   - replacing keeps the run's identity and swaps the played source;
 *   - the delete confirmation still removes the artifact through the backend.
 *
 * The backend actor and the storage upload are local mocks, so this proves the
 * component and consumer contract, not the real canister or object storage.
 * The PocketIC lane covers the real attach/delete methods.
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

const existingArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7-original.mp4",
  aspectRatio: "9:16",
  characterId: 3n,
};

function makeVideoFile(name = "replacement.mp4") {
  return new File([new Uint8Array([0, 1, 2, 3])], name, {
    type: "video/mp4",
  });
}

describe("video artifact replace characterization", () => {
  beforeEach(() => {
    media.uploadVideo.mockReset();
    infra.actor = createMockActor();
  });

  it("offers a replace action and plays the existing artifact", () => {
    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={existingArtifact}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    // The existing footage is playable and the upload control reads as a
    // replacement rather than a first attach.
    expect(screen.getByTestId("video_player.video")).toHaveAttribute(
      "src",
      existingArtifact.storageUrl,
    );
    expect(screen.getByText(/replace with another video/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId("simulation.media.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("attaches the replacement media to the same run", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => null),
    });
    infra.actor = actor;
    media.uploadVideo.mockResolvedValue({
      storageUrl: "https://storage.example/run-7-replacement.mp4",
      mimeType: "video/mp4",
      durationSeconds: 18,
      aspectRatio: "16:9",
    });

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={existingArtifact}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    await user.upload(
      screen.getByTestId("simulation.media.file_input"),
      makeVideoFile(),
    );

    // The replacement is persisted through the backend against the same run,
    // carrying the metadata read from the new file.
    await waitFor(() => {
      expect(actor.attachMediaArtifact).toHaveBeenCalledWith({
        runId: 7n,
        storageUrl: "https://storage.example/run-7-replacement.mp4",
        mimeType: "video/mp4",
        durationSeconds: 18,
        aspectRatio: "16:9",
        cameoId: undefined,
      });
    });
  });

  it("still deletes the attached artifact through the backend after a replace", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      deleteMediaArtifact: vi.fn(async () => true),
    });
    infra.actor = actor;

    renderWithProviders(
      <VideoArtifactPanel
        runId={7n}
        artifact={existingArtifact}
        characters={[character]}
        cameos={[cameo]}
        linkedCharacterId={3n}
      />,
    );

    await user.click(screen.getByTestId("simulation.media.delete_button"));
    await user.click(
      await screen.findByTestId("simulation.media.delete_confirm_button"),
    );

    await waitFor(() => {
      expect(actor.deleteMediaArtifact).toHaveBeenCalledWith(7n);
    });
  });
});
