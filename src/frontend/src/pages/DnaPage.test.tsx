import type { DnaRecord } from "@/backend";
import DnaPage from "@/pages/DnaPage";
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

const marlow: DnaRecord = {
  id: 1n,
  characterName: "Marlow Quinn",
  identityBlocks: "Cartographer of dead stars.",
  immutableTraits: "Never removes the visor.",
  visualMarkers: "Amber visor.",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

const vessel: DnaRecord = {
  ...marlow,
  id: 2n,
  characterName: "Vessel-07",
  activeVersion: 3n,
};

describe("DnaPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [marlow, vessel]),
    });
  });

  it("lists DNA records with their protected fields", async () => {
    renderWithProviders(<DnaPage />);

    expect(
      await screen.findByRole("heading", { name: /dna registry/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Marlow Quinn")).toBeInTheDocument();
    expect(screen.getByText("Vessel-07")).toBeInTheDocument();
    expect(
      screen.getAllByText("Cartographer of dead stars.").length,
    ).toBeGreaterThan(0);
  });

  it("filters records by character name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DnaPage />);

    await screen.findByText("Marlow Quinn");
    await user.type(screen.getByTestId("dna.search_input"), "vessel");

    expect(screen.getByText("Vessel-07")).toBeInTheDocument();
    expect(screen.queryByText("Marlow Quinn")).not.toBeInTheDocument();
  });

  it("creates a DNA entry through the backend", async () => {
    const user = userEvent.setup();
    const createDna = vi.fn(async () => marlow);
    infra.actor = createMockActor({
      listDna: vi.fn(async () => []),
      createDna,
    });

    renderWithProviders(<DnaPage />);

    await user.click(await screen.findByTestId("dna.create_button"));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByTestId("dna.name.input"),
      "Marlow Quinn",
    );
    await user.type(
      within(dialog).getByTestId("dna.identity_blocks.textarea"),
      "Cartographer of dead stars.",
    );
    await user.type(
      within(dialog).getByTestId("dna.immutable_traits.textarea"),
      "Never removes the visor.",
    );
    await user.type(
      within(dialog).getByTestId("dna.visual_markers.textarea"),
      "Amber visor.",
    );
    await user.click(within(dialog).getByTestId("dna.submit_button"));

    await waitFor(() => {
      expect(createDna).toHaveBeenCalledWith({
        characterName: "Marlow Quinn",
        identityBlocks: "Cartographer of dead stars.",
        immutableTraits: "Never removes the visor.",
        visualMarkers: "Amber visor.",
      });
    });
  });

  it("validates required fields before creating", async () => {
    const user = userEvent.setup();
    const createDna = vi.fn(async () => marlow);
    infra.actor = createMockActor({
      listDna: vi.fn(async () => []),
      createDna,
    });

    renderWithProviders(<DnaPage />);

    await user.click(await screen.findByTestId("dna.create_button"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("dna.submit_button"));

    expect(createDna).not.toHaveBeenCalled();
    expect(
      within(dialog).getByTestId("dna-character-name.error_state"),
    ).toBeInTheDocument();
  });

  it("deletes a DNA entry after confirmation", async () => {
    const user = userEvent.setup();
    const deleteDna = vi.fn(async () => true);
    infra.actor = createMockActor({
      listDna: vi.fn(async () => [marlow]),
      deleteDna,
    });

    renderWithProviders(<DnaPage />);

    await user.click(await screen.findByTestId("dna.delete_button.1"));
    await user.click(await screen.findByTestId("dna.delete_confirm_button"));

    await waitFor(() => {
      expect(deleteDna).toHaveBeenCalledWith(1n);
    });
  });
});
