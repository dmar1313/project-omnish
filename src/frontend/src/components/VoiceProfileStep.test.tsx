import type { VoiceDraft } from "@/components/VoiceProfileStep";
import { VOICE_PHRASE, VoiceProfileStep } from "@/components/VoiceProfileStep";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Voice-profile step: the operator reads an on-screen phrase, records, and can
 * re-record before confirming. The MediaRecorder wrapper is stubbed locally so
 * the component's own state machine is exercised without a microphone.
 */

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

function makeRecorderStub(file: File | null) {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => file),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}

function renderStep(voice: VoiceDraft | null = null) {
  const onChange = vi.fn();
  render(<VoiceProfileStep voice={voice} onChange={onChange} />);
  return { onChange };
}

describe("VoiceProfileStep", () => {
  beforeEach(() => {
    recorder.createVoiceRecorder.mockReset();
    if (typeof URL.createObjectURL !== "function") {
      URL.createObjectURL = () => "blob:voice";
    }
    if (typeof URL.revokeObjectURL !== "function") {
      URL.revokeObjectURL = () => {};
    }
  });

  it("shows the phrase to read aloud and a start control", () => {
    renderStep();

    expect(screen.getByText(`“${VOICE_PHRASE}”`)).toBeInTheDocument();
    expect(
      screen.getByTestId("character_creation.voice.record_button"),
    ).toBeInTheDocument();
  });

  it("records a sample and hands the file to the parent", async () => {
    const user = userEvent.setup();
    const file = new File([new Uint8Array([1])], "voice-sample.webm", {
      type: "audio/webm",
    });
    const stub = makeRecorderStub(file);
    recorder.createVoiceRecorder.mockReturnValue(stub);
    const { onChange } = renderStep();

    await user.click(
      screen.getByTestId("character_creation.voice.record_button"),
    );
    await user.click(
      await screen.findByTestId("character_creation.voice.stop_button"),
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ file }));
    });
    expect(stub.start).toHaveBeenCalledTimes(1);
    expect(stub.stop).toHaveBeenCalledTimes(1);
  });

  it("surfaces a microphone permission failure", async () => {
    const user = userEvent.setup();
    const stub = makeRecorderStub(null);
    stub.start.mockRejectedValueOnce(new Error("denied"));
    recorder.createVoiceRecorder.mockReturnValue(stub);
    renderStep();

    await user.click(
      screen.getByTestId("character_creation.voice.record_button"),
    );

    expect(
      await screen.findByTestId("character_creation.voice.error_state"),
    ).toHaveTextContent(/microphone access was denied/i);
  });

  it("offers re-record for a captured sample and clears it", async () => {
    const user = userEvent.setup();
    const voice: VoiceDraft = {
      file: new File([new Uint8Array([1])], "voice-sample.webm", {
        type: "audio/webm",
      }),
      previewUrl: "blob:voice",
    };
    const { onChange } = renderStep(voice);

    expect(
      screen.getByTestId("character_creation.voice.audio"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByTestId("character_creation.voice.rerecord_button"),
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
