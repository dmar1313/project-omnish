import type { AssetIngredient, DnaRecord } from "@/backend";
import { AssetKind } from "@/backend";
import AssetsPage from "@/pages/AssetsPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const infra = vi.hoisted(() => ({
  isAuthenticated: true,
  isInitializing: false,
  actor: null as unknown,
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

const character: DnaRecord = {
  id: 7n,
  characterName: "Marlow Quinn",
  identityBlocks: "Cartographer.",
  immutableTraits: "Visor.",
  visualMarkers: "Amber.",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

const keyframe: AssetIngredient = {
  id: 1n,
  fileName: "vessel-07-keyframe.png",
  fileType: AssetKind.image,
  storageUrl: "https://storage.example/keyframe.png",
  tags: ["keyframe", "vessel"],
  linkedCharacterId: 7n,
  createdAt: 1_700_000_000_000_000_000n,
};

const ambience: AssetIngredient = {
  id: 2n,
  fileName: "engine-hum.wav",
  fileType: AssetKind.audio,
  storageUrl: "https://storage.example/hum.wav",
  tags: [],
  createdAt: 1_700_000_100_000_000_000n,
};

describe("AssetsPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    infra.actor = createMockActor({
      listAssets: vi.fn(async () => [keyframe, ambience]),
      listDna: vi.fn(async () => [character]),
    });
  });

  it("lists ingredients with their linked character", async () => {
    renderWithProviders(<AssetsPage />);

    expect(
      await screen.findByRole("heading", { name: /assets/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("vessel-07-keyframe.png"),
    ).toBeInTheDocument();
    expect(screen.getByText("engine-hum.wav")).toBeInTheDocument();
    expect(screen.getByText("Marlow Quinn")).toBeInTheDocument();
  });

  it("filters ingredients by type", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssetsPage />);

    await screen.findByText("vessel-07-keyframe.png");
    await user.click(screen.getByTestId("assets.filter.audio.tab"));

    expect(screen.getByText("engine-hum.wav")).toBeInTheDocument();
    expect(
      screen.queryByText("vessel-07-keyframe.png"),
    ).not.toBeInTheDocument();
  });

  it("registers a new ingredient linked to a character", async () => {
    const user = userEvent.setup();
    const createAsset = vi.fn(async () => keyframe);
    infra.actor = createMockActor({
      listAssets: vi.fn(async () => []),
      listDna: vi.fn(async () => [character]),
      createAsset,
    });

    renderWithProviders(<AssetsPage />);

    await user.click(await screen.findByTestId("assets.upload_button"));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByTestId("assets.file_name.input"),
      "vessel-07-keyframe.png",
    );
    await user.type(
      within(dialog).getByTestId("assets.storage_url.input"),
      "https://storage.example/keyframe.png",
    );
    await user.type(
      within(dialog).getByTestId("assets.tags.input"),
      "keyframe, vessel",
    );

    await user.click(
      within(dialog).getByTestId("assets.linked_character.select"),
    );
    await user.click(
      await screen.findByRole("option", { name: "Marlow Quinn" }),
    );

    await user.click(within(dialog).getByTestId("assets.submit_button"));

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith({
        fileName: "vessel-07-keyframe.png",
        storageUrl: "https://storage.example/keyframe.png",
        fileType: AssetKind.image,
        tags: ["keyframe", "vessel"],
        linkedCharacterId: 7n,
      });
    });
  });

  it("requires a file name and storage URL before registering", async () => {
    const user = userEvent.setup();
    const createAsset = vi.fn(async () => keyframe);
    infra.actor = createMockActor({
      listAssets: vi.fn(async () => []),
      listDna: vi.fn(async () => []),
      createAsset,
    });

    renderWithProviders(<AssetsPage />);

    await user.click(await screen.findByTestId("assets.upload_button"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("assets.submit_button"));

    expect(createAsset).not.toHaveBeenCalled();
    expect(
      within(dialog).getByTestId("assets.file_name.error_state"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("assets.storage_url.error_state"),
    ).toBeInTheDocument();
  });

  it("deletes an ingredient", async () => {
    const user = userEvent.setup();
    const deleteAsset = vi.fn(async () => true);
    infra.actor = createMockActor({
      listAssets: vi.fn(async () => [keyframe]),
      listDna: vi.fn(async () => [character]),
      deleteAsset,
    });

    renderWithProviders(<AssetsPage />);

    await user.click(await screen.findByTestId("assets.delete_button.1"));

    await waitFor(() => {
      expect(deleteAsset).toHaveBeenCalledWith(1n);
    });
  });

  it("updates tags and linked character inline", async () => {
    const user = userEvent.setup();
    const updateAsset = vi.fn(async () => keyframe);
    infra.actor = createMockActor({
      listAssets: vi.fn(async () => [keyframe]),
      listDna: vi.fn(async () => [character]),
      updateAsset,
    });

    renderWithProviders(<AssetsPage />);

    await user.click(await screen.findByTestId("assets.edit_button.1"));
    const tagsInput = await screen.findByTestId("assets.tags.input.1");
    await user.clear(tagsInput);
    await user.type(tagsInput, "hero, keyframe");
    await user.click(screen.getByTestId("assets.save_button.1"));

    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith(1n, {
        fileName: "vessel-07-keyframe.png",
        fileType: AssetKind.image,
        storageUrl: "https://storage.example/keyframe.png",
        tags: ["hero", "keyframe"],
        linkedCharacterId: 7n,
      });
    });
  });
});
