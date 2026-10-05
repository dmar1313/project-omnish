import type { AssetIngredient, DnaRecord } from "@/backend";
import { AssetKind } from "@/backend";
import { IngredientWorkbench } from "@/components/IngredientWorkbench";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// The workbench uploads through ExternalBlob, which would otherwise reach the
// network. This local stub records the bytes it was handed and returns a fixed
// direct URL, so the test observes the workbench's own behavior only.
const blob = vi.hoisted(() => ({
  fromBytes: vi.fn(),
}));

vi.mock("@caffeineai/object-storage", () => ({
  ExternalBlob: {
    fromBytes: blob.fromBytes,
  },
}));

const marlow: DnaRecord = {
  id: 3n,
  characterName: "Marlow Quinn",
  identityBlocks: "A cartographer of dead stars.",
  immutableTraits: "Never removes the visor.",
  visualMarkers: "Amber visor, ash-grey coat.",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

const vessel: DnaRecord = {
  ...marlow,
  id: 9n,
  characterName: "Vessel-07",
};

const createdAsset: AssetIngredient = {
  id: 42n,
  fileName: "reference.png",
  fileType: AssetKind.image,
  storageUrl: "https://storage.example/reference.png",
  tags: ["reference", "lighting"],
  linkedCharacterId: 3n,
  createdAt: 1_700_000_000_000_000_000n,
};

function makeBlobStub() {
  const withUploadProgress = vi.fn();
  const getDirectURL = vi.fn(() => "https://storage.example/reference.png");
  const stub = { withUploadProgress, getDirectURL };
  withUploadProgress.mockReturnValue(stub);
  return stub;
}

function imageFile(name = "reference.png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

describe("IngredientWorkbench", () => {
  // jsdom's File does not implement arrayBuffer(), which the workbench calls to
  // read the upload bytes. Provide it so the component's own logic is exercised.
  beforeAll(() => {
    if (typeof File.prototype.arrayBuffer !== "function") {
      File.prototype.arrayBuffer = function arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      };
    }
  });

  beforeEach(() => {
    infra.actor = createMockActor();
    blob.fromBytes.mockReset();
    blob.fromBytes.mockImplementation(() => makeBlobStub());
  });

  it("renders the workbench and lists existing characters in the link select", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <IngredientWorkbench dna={[marlow, vessel]} onStaged={vi.fn()} />,
    );

    expect(screen.getByTestId("feed.workbench.panel")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /ingredient workbench/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("feed.workbench.select"));

    expect(
      await screen.findByRole("option", { name: "Marlow Quinn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Vessel-07" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Unassigned" }),
    ).toBeInTheDocument();
  });

  it("links an uploaded ingredient to the selected character", async () => {
    const user = userEvent.setup();
    const createAsset = vi.fn(async () => createdAsset);
    infra.actor = createMockActor({ createAsset });
    const onStaged = vi.fn();

    renderWithProviders(
      <IngredientWorkbench dna={[marlow]} onStaged={onStaged} />,
    );

    await user.click(screen.getByTestId("feed.workbench.select"));
    await user.click(
      await screen.findByRole("option", { name: "Marlow Quinn" }),
    );

    await user.type(
      screen.getByTestId("feed.workbench.input"),
      "reference, lighting",
    );

    await user.upload(
      screen.getByTestId("feed.workbench.upload_button"),
      imageFile(),
    );

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith({
        fileName: "reference.png",
        fileType: AssetKind.image,
        storageUrl: "https://storage.example/reference.png",
        tags: ["reference", "lighting"],
        linkedCharacterId: 3n,
      });
    });

    await waitFor(() => {
      expect(onStaged).toHaveBeenCalledWith(createdAsset);
    });
  });

  it("uploads without a character link when none is selected", async () => {
    const user = userEvent.setup();
    const createAsset = vi.fn(async () => ({
      ...createdAsset,
      linkedCharacterId: undefined,
    }));
    infra.actor = createMockActor({ createAsset });

    renderWithProviders(
      <IngredientWorkbench dna={[marlow]} onStaged={vi.fn()} />,
    );

    await user.upload(
      screen.getByTestId("feed.workbench.upload_button"),
      imageFile("unlinked.png"),
    );

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith({
        fileName: "unlinked.png",
        fileType: AssetKind.image,
        storageUrl: "https://storage.example/reference.png",
        tags: [],
        linkedCharacterId: undefined,
      });
    });
  });

  it("surfaces an upload failure as an alert", async () => {
    const user = userEvent.setup();
    const createAsset = vi.fn(async () => {
      throw new Error("upload rejected");
    });
    infra.actor = createMockActor({ createAsset });

    renderWithProviders(
      <IngredientWorkbench dna={[marlow]} onStaged={vi.fn()} />,
    );

    await user.upload(
      screen.getByTestId("feed.workbench.upload_button"),
      imageFile(),
    );

    expect(
      await screen.findByTestId("feed.workbench.error_state"),
    ).toBeInTheDocument();
  });

  it("explains how ingredients relate to characters", () => {
    renderWithProviders(
      <IngredientWorkbench dna={[marlow]} onStaged={vi.fn()} />,
    );

    const explanation = screen.getByTestId("feed.workbench.explanation");
    expect(explanation).toHaveTextContent(/ingredient is a raw asset/i);
    expect(explanation).toHaveTextContent(/attach to a character/i);
  });

  it("guides the user to establish a character when none exist", () => {
    renderWithProviders(<IngredientWorkbench dna={[]} onStaged={vi.fn()} />);

    expect(screen.getByTestId("feed.workbench.empty_state")).toHaveTextContent(
      /no characters yet/i,
    );
    expect(
      screen.getByTestId("feed.workbench.empty_create_button"),
    ).toBeInTheDocument();
    // The empty selector is replaced by the guided prompt.
    expect(
      screen.queryByTestId("feed.workbench.select"),
    ).not.toBeInTheDocument();
  });

  it("establishes a character from the workbench and makes it selectable", async () => {
    const user = userEvent.setup();
    const created: DnaRecord = {
      ...marlow,
      id: 77n,
      characterName: "Newly Minted",
    };
    const createDna = vi.fn(async () => created);
    infra.actor = createMockActor({ createDna });

    const { rerender } = renderWithProviders(
      <IngredientWorkbench dna={[]} onStaged={vi.fn()} />,
    );

    await user.click(screen.getByTestId("feed.workbench.empty_create_button"));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByTestId("dna.name.input"),
      "Newly Minted",
    );
    await user.type(
      within(dialog).getByTestId("dna.identity_blocks.textarea"),
      "A fresh identity.",
    );
    await user.type(
      within(dialog).getByTestId("dna.immutable_traits.textarea"),
      "Always curious.",
    );
    await user.type(
      within(dialog).getByTestId("dna.visual_markers.textarea"),
      "Copper hair.",
    );
    await user.click(within(dialog).getByTestId("dna.submit_button"));

    await waitFor(() => {
      expect(createDna).toHaveBeenCalledWith({
        characterName: "Newly Minted",
        identityBlocks: "A fresh identity.",
        immutableTraits: "Always curious.",
        visualMarkers: "Copper hair.",
      });
    });

    // The parent refetches DNA and passes the new record down; the workbench
    // must now offer it in the link selector.
    rerender(<IngredientWorkbench dna={[created]} onStaged={vi.fn()} />);

    await user.click(await screen.findByTestId("feed.workbench.select"));
    expect(
      await screen.findByRole("option", { name: "Newly Minted" }),
    ).toBeInTheDocument();
  });

  it("links an uploaded ingredient to a character established from the workbench", async () => {
    const user = userEvent.setup();
    const created: DnaRecord = {
      ...marlow,
      id: 77n,
      characterName: "Newly Minted",
    };
    const createAsset = vi.fn(async () => ({
      ...createdAsset,
      linkedCharacterId: 77n,
    }));
    infra.actor = createMockActor({ createAsset });

    renderWithProviders(
      <IngredientWorkbench dna={[created]} onStaged={vi.fn()} />,
    );

    await user.click(screen.getByTestId("feed.workbench.select"));
    await user.click(
      await screen.findByRole("option", { name: "Newly Minted" }),
    );

    await user.upload(
      screen.getByTestId("feed.workbench.upload_button"),
      imageFile(),
    );

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith(
        expect.objectContaining({ linkedCharacterId: 77n }),
      );
    });
  });
});
