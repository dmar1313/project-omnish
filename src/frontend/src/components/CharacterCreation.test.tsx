import type { AssetIngredient, DnaRecord } from "@/backend";
import { AssetKind } from "@/backend";
import { CharacterCreation } from "@/components/CharacterCreation";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Character-creation wizard integration coverage.
 *
 * The wizard composes the text form, the reference-image step, and the guided
 * camera cameo, then persists the character and links each captured media file
 * through platform storage. These journeys drive the real components with a
 * local typed actor mock, a stubbed object-storage blob, a stubbed camera hook,
 * and a stubbed voice recorder — no network, device, or microphone is touched.
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

const blob = vi.hoisted(() => ({
  fromBytes: vi.fn(),
}));

vi.mock("@caffeineai/object-storage", () => ({
  ExternalBlob: {
    fromBytes: blob.fromBytes,
  },
}));

const camera = vi.hoisted(() => ({
  useCamera: vi.fn(),
}));

vi.mock("@caffeineai/camera", () => ({
  useCamera: camera.useCamera,
}));

const recorder = vi.hoisted(() => ({
  createVoiceRecorder: vi.fn(),
}));

vi.mock("@/lib/mediaCapture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mediaCapture")>();
  return {
    ...actual,
    createVoiceRecorder: recorder.createVoiceRecorder,
  };
});

const createdCharacter: DnaRecord = {
  id: 3n,
  characterName: "Marlow Quinn",
  identityBlocks: "",
  immutableTraits: "",
  visualMarkers: "",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

function makeBlobStub(url: string) {
  return { getDirectURL: vi.fn(() => url) };
}

function makeCameraStub(overrides: Record<string, unknown> = {}) {
  return {
    isActive: true,
    isSupported: true,
    error: null,
    isLoading: false,
    currentFacingMode: "user" as const,
    startCamera: vi.fn(async () => true),
    stopCamera: vi.fn(async () => {}),
    capturePhoto: vi.fn(async () => null),
    switchCamera: vi.fn(async () => true),
    retry: vi.fn(async () => true),
    videoRef: { current: null },
    canvasRef: { current: null },
    ...overrides,
  };
}

function makeRecorderStub(file: File | null) {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => file),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}

function imageFile(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

function renderWizard() {
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <CharacterCreation onCreated={onCreated} onCancel={onCancel} />,
  );
  return { onCreated, onCancel };
}

/** Fills the wizard's optional text form and continues. */
async function submitDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("dna.name.input"), "Marlow Quinn");
  await user.click(screen.getByTestId("dna.submit_button"));
}

describe("CharacterCreation wizard", () => {
  beforeAll(() => {
    if (typeof File.prototype.arrayBuffer !== "function") {
      File.prototype.arrayBuffer = function arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      };
    }
    if (typeof URL.createObjectURL !== "function") {
      URL.createObjectURL = () => "blob:preview";
    }
    if (typeof URL.revokeObjectURL !== "function") {
      URL.revokeObjectURL = () => {};
    }
  });

  beforeEach(() => {
    infra.actor = createMockActor();
    blob.fromBytes.mockReset();
    blob.fromBytes.mockImplementation(() =>
      makeBlobStub("https://storage.example/media"),
    );
    camera.useCamera.mockReset();
    camera.useCamera.mockReturnValue(makeCameraStub());
    recorder.createVoiceRecorder.mockReset();
  });

  it("presents text, image upload, and camera cameo as selectable methods", () => {
    renderWizard();

    expect(
      screen.getByTestId("character_creation.method.text"),
    ).toHaveTextContent(/text description/i);
    expect(
      screen.getByTestId("character_creation.method.image"),
    ).toHaveTextContent(/image upload/i);
    expect(
      screen.getByTestId("character_creation.method.camera"),
    ).toHaveTextContent(/camera cameo/i);
  });

  it("creates a character from text alone", async () => {
    const user = userEvent.setup();
    const createDna = vi.fn(async () => createdCharacter);
    infra.actor = createMockActor({ createDna });
    const { onCreated } = renderWizard();

    await user.click(screen.getByTestId("character_creation.method.text"));
    await submitDetails(user);

    // Text method skips the capture step and lands on review.
    expect(
      await screen.findByTestId("character_creation.submit_button"),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("character_creation.submit_button"));

    await waitFor(() => {
      expect(createDna).toHaveBeenCalledWith({
        characterName: "Marlow Quinn",
        identityBlocks: "",
        immutableTraits: "",
        visualMarkers: "",
      });
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(createdCharacter);
    });
  });

  it("uploads reference images and links each to the created character", async () => {
    const user = userEvent.setup();
    const createDna = vi.fn(async () => createdCharacter);
    const createAsset = vi.fn(
      async (input: { fileName: string }): Promise<AssetIngredient> => ({
        id: BigInt(input.fileName.length),
        fileName: input.fileName,
        fileType: AssetKind.image,
        storageUrl: "https://storage.example/media",
        tags: ["reference"],
        linkedCharacterId: createdCharacter.id,
        createdAt: 1_700_000_000_000_000_000n,
      }),
    );
    infra.actor = createMockActor({ createDna, createAsset });
    const { onCreated } = renderWizard();

    await user.click(screen.getByTestId("character_creation.method.image"));
    await submitDetails(user);

    await user.upload(
      screen.getByTestId("character_creation.image.upload_button"),
      [imageFile("front.png"), imageFile("side.png")],
    );
    await user.click(
      screen.getByTestId("character_creation.capture_continue_button"),
    );

    await user.click(
      await screen.findByTestId("character_creation.submit_button"),
    );

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledTimes(2);
    });
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "front.png",
        fileType: AssetKind.image,
        storageUrl: "https://storage.example/media",
        tags: ["reference"],
        linkedCharacterId: createdCharacter.id,
      }),
    );
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(createdCharacter);
    });
  });

  it("creates a character from a camera cameo alone: front, left, right, then voice", async () => {
    const user = userEvent.setup();
    const createDna = vi.fn(async () => createdCharacter);
    let assetSeq = 10n;
    const createAsset = vi.fn(
      async (input: { fileName: string }): Promise<AssetIngredient> => ({
        id: assetSeq++,
        fileName: input.fileName,
        fileType: input.fileName.endsWith(".webm")
          ? AssetKind.audio
          : AssetKind.image,
        storageUrl: "https://storage.example/media",
        tags: ["cameo"],
        linkedCharacterId: createdCharacter.id,
        createdAt: 1_700_000_000_000_000_000n,
      }),
    );
    const createCameo = vi.fn(async (input: unknown) => ({
      id: 1n,
      characterId: createdCharacter.id,
      status: { __kind__: "complete" as const },
      createdAt: 1_700_000_000_000_000_000n,
      ...(input as object),
    }));
    infra.actor = createMockActor({ createDna, createAsset, createCameo });

    // Each capture returns a fresh image file.
    camera.useCamera.mockReturnValue(
      makeCameraStub({
        capturePhoto: vi.fn(
          async () =>
            new File([new Uint8Array([1])], "shot.png", { type: "image/png" }),
        ),
      }),
    );
    const voiceFile = new File([new Uint8Array([1])], "voice-sample.webm", {
      type: "audio/webm",
    });
    recorder.createVoiceRecorder.mockReturnValue(makeRecorderStub(voiceFile));

    const { onCreated } = renderWizard();

    await user.click(screen.getByTestId("character_creation.method.camera"));
    await submitDetails(user);

    // Capture front, then left, then right.
    for (const angle of ["front", "left", "right"] as const) {
      await user.click(await screen.findByTestId("cameo.capture_button"));
      await waitFor(() => {
        expect(screen.getByTestId(`cameo.tab.${angle}`)).toBeInTheDocument();
      });
    }

    // Continue to the voice phase and record the sample.
    await user.click(screen.getByTestId("cameo.continue_button"));
    await screen.findByTestId("character_creation.voice.panel");
    await user.click(
      screen.getByTestId("character_creation.voice.record_button"),
    );
    await user.click(
      await screen.findByTestId("character_creation.voice.stop_button"),
    );
    await user.click(screen.getByTestId("cameo.continue_button"));

    await user.click(
      await screen.findByTestId("character_creation.submit_button"),
    );

    // Three photos + one voice sample are each persisted and linked.
    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledTimes(4);
    });
    const fileNames = createAsset.mock.calls.map(
      (call) => (call[0] as { fileName: string }).fileName,
    );
    expect(fileNames).toEqual([
      "cameo-front.png",
      "cameo-left.png",
      "cameo-right.png",
      "voice-sample.webm",
    ]);

    await waitFor(() => {
      expect(createCameo).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: createdCharacter.id,
          frontAssetId: 10n,
          leftAssetId: 11n,
          rightAssetId: 12n,
          voiceAssetId: 13n,
        }),
      );
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(createdCharacter);
    });
  });

  it("surfaces a backend failure during creation", async () => {
    const user = userEvent.setup();
    const createDna = vi.fn(async () => {
      throw new Error("Backend is not ready");
    });
    infra.actor = createMockActor({ createDna });
    renderWizard();

    await user.click(screen.getByTestId("character_creation.method.text"));
    await submitDetails(user);
    await user.click(
      await screen.findByTestId("character_creation.submit_button"),
    );

    expect(
      await screen.findByTestId("character_creation.error_state"),
    ).toHaveTextContent("Backend is not ready");
  });

  it("keeps the text fields available and optional in the wizard", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByTestId("character_creation.method.text"));

    const form = screen.getByTestId("dna.form");
    expect(within(form).getByTestId("dna.name.input")).toBeInTheDocument();
    expect(
      within(form).getByTestId("dna.identity_blocks.textarea"),
    ).toBeInTheDocument();
    expect(
      within(form).getByTestId("dna.immutable_traits.textarea"),
    ).toBeInTheDocument();
    expect(
      within(form).getByTestId("dna.visual_markers.textarea"),
    ).toBeInTheDocument();
  });
});
