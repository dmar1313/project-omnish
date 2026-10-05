import type { CameoShot } from "@/components/CameoCapture";
import { CameoCapture } from "@/components/CameoCapture";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guided camera cameo: three ordered photo angles (front, left, right) with
 * per-step guidance and retake, then a voice phase. The camera hook is stubbed
 * locally so the component's own sequencing is exercised without a device.
 */

const camera = vi.hoisted(() => ({
  useCamera: vi.fn(),
}));

vi.mock("@caffeineai/camera", () => ({
  useCamera: camera.useCamera,
}));

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

function renderCapture(
  shots: Partial<Record<"front" | "left" | "right", CameoShot>> = {},
) {
  const onShotsChange = vi.fn();
  const onVoiceChange = vi.fn();
  const onBack = vi.fn();
  const onContinue = vi.fn();
  render(
    <CameoCapture
      shots={shots}
      voice={null}
      onShotsChange={onShotsChange}
      onVoiceChange={onVoiceChange}
      onBack={onBack}
      onContinue={onContinue}
    />,
  );
  return { onShotsChange, onVoiceChange, onBack, onContinue };
}

describe("CameoCapture", () => {
  beforeEach(() => {
    camera.useCamera.mockReset();
    camera.useCamera.mockReturnValue(makeCameraStub());
    if (typeof URL.createObjectURL !== "function") {
      URL.createObjectURL = () => "blob:capture";
    }
    if (typeof URL.revokeObjectURL !== "function") {
      URL.revokeObjectURL = () => {};
    }
  });

  it("starts on the front angle with its guidance", () => {
    renderCapture();

    expect(screen.getByTestId("cameo.panel")).toBeInTheDocument();
    // The angle title appears in both the tab and the guidance card.
    expect(screen.getAllByText("Front facing").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/look straight at the camera/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cameo.tab.front")).toBeInTheDocument();
    expect(screen.getByTestId("cameo.tab.left")).toBeInTheDocument();
    expect(screen.getByTestId("cameo.tab.right")).toBeInTheDocument();
  });

  it("captures the front photo and advances to the left angle", async () => {
    const user = userEvent.setup();
    const file = new File([new Uint8Array([1])], "shot.png", {
      type: "image/png",
    });
    camera.useCamera.mockReturnValue(
      makeCameraStub({ capturePhoto: vi.fn(async () => file) }),
    );
    const { onShotsChange } = renderCapture();

    await user.click(screen.getByTestId("cameo.capture_button"));

    await waitFor(() => {
      expect(onShotsChange).toHaveBeenCalledTimes(1);
    });
    const next = onShotsChange.mock.calls[0][0] as Record<string, CameoShot>;
    expect(next.front?.file.name).toBe("cameo-front.png");
    // The active step advances to the next missing angle.
    expect(
      screen.getByText(/slowly turn your head to your left/i),
    ).toBeInTheDocument();
  });

  it("shows a retake control for a captured angle and clears it", async () => {
    const user = userEvent.setup();
    const shot: CameoShot = {
      file: new File([new Uint8Array([1])], "cameo-front.png", {
        type: "image/png",
      }),
      previewUrl: "blob:front",
    };
    const { onShotsChange } = renderCapture({ front: shot });

    expect(screen.getByAltText("Front facing capture")).toBeInTheDocument();
    await user.click(screen.getByTestId("cameo.retake_button"));

    expect(onShotsChange).toHaveBeenCalledWith({});
  });

  it("moves to the voice phase and continues to review", async () => {
    const user = userEvent.setup();
    const { onContinue } = renderCapture();

    await user.click(screen.getByTestId("cameo.continue_button"));

    // Voice phase shows the phrase to read aloud.
    expect(
      await screen.findByTestId("character_creation.voice.panel"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("cameo.continue_button"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("returns to the photo phase from the voice phase", async () => {
    const user = userEvent.setup();
    const { onBack } = renderCapture();

    await user.click(screen.getByTestId("cameo.continue_button"));
    await screen.findByTestId("character_creation.voice.panel");
    await user.click(screen.getByTestId("cameo.back_button"));

    expect(screen.getByTestId("cameo.tab.front")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});
