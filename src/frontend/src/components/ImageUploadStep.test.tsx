import type { ImageDraft } from "@/components/ImageUploadStep";
import { ImageUploadStep } from "@/components/ImageUploadStep";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Reference-image staging step: files are held locally with an object-URL
 * thumbnail, non-images are ignored, and each item can be removed before the
 * character is persisted.
 */

function imageFile(name: string, type = "image/png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function renderStep(images: ImageDraft[] = []) {
  const onChange = vi.fn();
  const onBack = vi.fn();
  const onContinue = vi.fn();
  render(
    <ImageUploadStep
      images={images}
      onChange={onChange}
      onBack={onBack}
      onContinue={onContinue}
    />,
  );
  return { onChange, onBack, onContinue };
}

describe("ImageUploadStep", () => {
  beforeAll(() => {
    if (typeof URL.createObjectURL !== "function") {
      URL.createObjectURL = () => "blob:preview";
    }
    if (typeof URL.revokeObjectURL !== "function") {
      URL.revokeObjectURL = () => {};
    }
  });

  it("shows an empty state and a skip affordance when no images are staged", () => {
    renderStep();

    expect(
      screen.getByTestId("character_creation.image.empty_state"),
    ).toHaveTextContent(/no images added yet/i);
    expect(
      screen.getByTestId("character_creation.capture_continue_button"),
    ).toHaveTextContent(/skip for now/i);
  });

  it("stages uploaded images with a thumbnail and file name", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();

    await user.upload(
      screen.getByTestId("character_creation.image.upload_button"),
      [imageFile("front.png"), imageFile("side.png")],
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    const staged = onChange.mock.calls[0][0] as ImageDraft[];
    expect(staged).toHaveLength(2);
    expect(staged.map((draft) => draft.file.name)).toEqual([
      "front.png",
      "side.png",
    ]);
    expect(staged[0].previewUrl).toBeTruthy();
  });

  it("ignores files that are not images", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();

    await user.upload(
      screen.getByTestId("character_creation.image.upload_button"),
      [imageFile("notes.txt", "text/plain")],
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders staged thumbnails and removes one by id", async () => {
    const user = userEvent.setup();
    const staged: ImageDraft[] = [
      { id: "a", file: imageFile("front.png"), previewUrl: "blob:front" },
      { id: "b", file: imageFile("side.png"), previewUrl: "blob:side" },
    ];
    const { onChange } = renderStep(staged);

    expect(screen.getByAltText("front.png")).toBeInTheDocument();
    expect(screen.getByAltText("side.png")).toBeInTheDocument();

    await user.click(
      screen.getByTestId("character_creation.image.remove_button.1"),
    );

    expect(onChange).toHaveBeenCalledWith([staged[1]]);
  });

  it("continues to review once images are staged", async () => {
    const user = userEvent.setup();
    const staged: ImageDraft[] = [
      { id: "a", file: imageFile("front.png"), previewUrl: "blob:front" },
    ];
    const { onContinue } = renderStep(staged);

    await user.click(
      screen.getByTestId("character_creation.capture_continue_button"),
    );

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
