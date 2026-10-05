import { Button } from "@/components/ui/button";
import { createVoiceRecorder } from "@/lib/mediaCapture";
import { cn } from "@/lib/utils";
import { Mic, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** A recorded voice sample staged locally before persistence. */
export interface VoiceDraft {
  file: File;
  previewUrl: string;
}

export interface VoiceProfileStepProps {
  voice: VoiceDraft | null;
  onChange: (voice: VoiceDraft | null) => void;
}

/** The phrase the operator reads aloud to produce a consistent voice sample. */
export const VOICE_PHRASE = "Four, seven, two, nine, one, six";

/**
 * Voice-profile capture step.
 *
 * Wraps the MediaRecorder helper with live level feedback, an elapsed timer,
 * and a re-record path so the operator can confirm the sample before it is
 * linked to the character as an audio asset.
 */
export function VoiceProfileStep({ voice, onChange }: VoiceProfileStepProps) {
  const recorderRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => recorderRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const start = async () => {
    setError(null);
    setSeconds(0);
    try {
      const recorder = createVoiceRecorder(setLevel);
      recorderRef.current = recorder;
      await recorder.start();
      setIsRecording(true);
    } catch {
      setError(
        "Microphone access was denied. Allow it to record a voice sample.",
      );
      recorderRef.current = null;
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const file = await recorder.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setLevel(0);
    if (file) onChange({ file, previewUrl: URL.createObjectURL(file) });
  };

  const reset = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setIsRecording(false);
    setLevel(0);
    setSeconds(0);
    if (voice) URL.revokeObjectURL(voice.previewUrl);
    onChange(null);
  };

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      data-ocid="character_creation.voice.panel"
    >
      <div className="flex items-center gap-2">
        <Mic className="size-4 text-primary" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Read aloud
        </p>
      </div>
      <p className="font-display text-lg font-semibold tracking-tight text-foreground">
        “{VOICE_PHRASE}”
      </p>

      {voice && !isRecording ? (
        <div className="flex flex-col gap-3">
          {/* biome-ignore lint/a11y/useMediaCaption: the sample is the user's own recording of an on-screen phrase; no caption track exists. */}
          <audio
            controls
            src={voice.previewUrl}
            className="w-full"
            data-ocid="character_creation.voice.audio"
          />
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            data-ocid="character_creation.voice.rerecord_button"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Re-record
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "size-2.5 rounded-full",
                isRecording ? "bg-destructive animate-pulse" : "bg-muted",
              )}
              aria-hidden="true"
            />
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </span>
            <div className="flex h-6 flex-1 items-end gap-0.5">
              {Array.from({ length: 24 }, (_, i) => `bar-${i}`).map((id, i) => (
                <span
                  key={id}
                  className="w-full rounded-sm bg-primary/70 transition-all"
                  style={{
                    height: isRecording
                      ? `${Math.max(8, Math.min(100, level * 100 * (0.5 + (i % 5) / 5)))}%`
                      : "8%",
                  }}
                />
              ))}
            </div>
          </div>

          {isRecording ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void stop()}
              data-ocid="character_creation.voice.stop_button"
            >
              <Square className="size-4" aria-hidden="true" />
              Stop recording
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void start()}
              data-ocid="character_creation.voice.record_button"
            >
              <Mic className="size-4" aria-hidden="true" />
              Start recording
            </Button>
          )}
        </div>
      )}

      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-ocid="character_creation.voice.error_state"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
