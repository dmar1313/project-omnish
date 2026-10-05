import type { DnaInput, DnaRecord } from "@/backend";
import { DnaForm } from "@/components/DnaForm";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Characterization of the existing text-based character creation contract.
 *
 * The upcoming character-creation work adds image upload, camera cameo, and
 * voice capture, but the text fields (name, identity blocks, immutable traits,
 * visual markers) must remain available and continue to submit the same
 * `DnaInput` shape. These tests pin that contract so the new input methods
 * cannot silently break text-only creation.
 */

const marlow: DnaRecord = {
  id: 3n,
  characterName: "Marlow Quinn",
  identityBlocks: "A cartographer of dead stars.",
  immutableTraits: "Never removes the visor.",
  visualMarkers: "Amber visor, ash-grey coat.",
  activeVersion: 1n,
  createdAt: 1_700_000_000_000_000_000n,
};

function renderForm(overrides: Partial<Parameters<typeof DnaForm>[0]> = {}) {
  const onSubmit = vi.fn<(input: DnaInput) => void>();
  const onCancel = vi.fn();
  render(
    <DnaForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      isPending={false}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

describe("DnaForm text-based creation", () => {
  it("renders all four text fields for a new character", () => {
    renderForm();

    expect(screen.getByTestId("dna.name.input")).toBeInTheDocument();
    expect(
      screen.getByTestId("dna.identity_blocks.textarea"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dna.immutable_traits.textarea"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dna.visual_markers.textarea"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("dna.submit_button")).toHaveTextContent(
      /create entry/i,
    );
  });

  it("submits the trimmed text fields as a DnaInput", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByTestId("dna.name.input"), "  Marlow Quinn  ");
    await user.type(
      screen.getByTestId("dna.identity_blocks.textarea"),
      "  Cartographer of dead stars.  ",
    );
    await user.type(
      screen.getByTestId("dna.immutable_traits.textarea"),
      "  Never removes the visor.  ",
    );
    await user.type(
      screen.getByTestId("dna.visual_markers.textarea"),
      "  Amber visor.  ",
    );
    await user.click(screen.getByTestId("dna.submit_button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        characterName: "Marlow Quinn",
        identityBlocks: "Cartographer of dead stars.",
        immutableTraits: "Never removes the visor.",
        visualMarkers: "Amber visor.",
      });
    });
  });

  it("blocks submission and flags every empty required field", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByTestId("dna.submit_button"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("dna-character-name.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dna-identity-blocks.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dna-immutable-traits.error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dna-visual-markers.error_state"),
    ).toBeInTheDocument();
  });

  it("prefills an existing record and submits edits", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ record: marlow });

    expect(screen.getByTestId("dna.name.input")).toHaveValue("Marlow Quinn");
    expect(screen.getByTestId("dna.identity_blocks.textarea")).toHaveValue(
      "A cartographer of dead stars.",
    );
    expect(screen.getByTestId("dna.submit_button")).toHaveTextContent(
      /save changes/i,
    );

    await user.clear(screen.getByTestId("dna.name.input"));
    await user.type(screen.getByTestId("dna.name.input"), "Marlow Q.");
    await user.click(screen.getByTestId("dna.submit_button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ characterName: "Marlow Q." }),
      );
    });
  });

  it("invokes onCancel without submitting", async () => {
    const user = userEvent.setup();
    const { onSubmit, onCancel } = renderForm();

    await user.click(screen.getByTestId("dna.cancel_button"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables submission while a create is pending", () => {
    renderForm({ isPending: true });

    expect(screen.getByTestId("dna.submit_button")).toBeDisabled();
  });

  it("surfaces a backend error message", () => {
    renderForm({ errorMessage: "Backend is not ready" });

    expect(screen.getByTestId("dna.form.error_state")).toHaveTextContent(
      "Backend is not ready",
    );
  });
});
