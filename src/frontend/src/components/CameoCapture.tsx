import {
  type VoiceDraft,
  VoiceProfileStep,
} from "@/components/VoiceProfileStep";
import { Button } from "@/components/ui/button";
import { captureFileName } from "@/lib/mediaCapture";
import { cn } from "@/lib/utils";
import { useCamera } from "@caffeineai/camera";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

export type CameoAngle = "front" | "left" | "right";

export interface CameoShot {
  file: File;
  previewUrl: string;
}

export type CameoVoice = VoiceDraft;

export interface CameoCaptureProps {
  /** Captured photos keyed by angle. */
  shots: Partial<Record<CameoAngle, CameoShot>>;
  /** Recorded voice sample, if any. */
  voice: CameoVoice | null;
  onShotsChange: (shots: Partial<Record<CameoAngle, CameoShot>>) => void;
  onVoiceChange: (voice: CameoVoice | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

interface CameoStep {
  angle: CameoAngle;
  title: string;
  guidance: string;
}

const CAMEO_STEPS: CameoStep[] = [
  {
    angle: "front",
    title: "Front facing",
    guidance: "Look straight at the camera and hold still.",
  },
  {
    angle: "left",
    title: "Turn left",
    guidance: "Slowly turn your head to your left, keeping your face in frame.",
  },
  {
    angle: "right",
    title: "Turn right",
    guidance: "Now turn your head to your right, still facing the camera.",
  },
];

/**
 * Guided camera cameo: three ordered photo angles (front, left, right) with
 * per-step guidance and retake, followed by a voice sample recorded from an
 * on-screen phrase. Captured media is handed to the parent as drafts; the
 * parent persists each file through platform storage and links it to the
 * character.
 */
export function CameoCapture({
  shots,
  voice,
  onShotsChange,
  onVoiceChange,
  onBack,
  onContinue,
}: CameoCaptureProps) {
  const camera = useCamera({ facingMode: "user", width: 720, height: 720 });
  const [activeAngle, setActiveAngle] = useState<CameoAngle>("front");
  const [phase, setPhase] = useState<"photos" | "voice">("photos");
  const [isCapturing, setIsCapturing] = useState(false);

  const allPhotosDone = CAMEO_STEPS.every((step) => shots[step.angle]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: camera controls are stable per mount; restarting on phase change is intentional.
  useEffect(() => {
    if (phase === "photos") void camera.startCamera();
    return () => {
      void camera.stopCamera();
    };
  }, [phase]);

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const file = await camera.capturePhoto();
      if (!file) return;
      const named = new File([file], captureFileName(activeAngle, file.type), {
        type: file.type,
      });
      onShotsChange({
        ...shots,
        [activeAngle]: {
          file: named,
          previewUrl: URL.createObjectURL(named),
        },
      });
      const next = CAMEO_STEPS.find(
        (step) => !shots[step.angle] && step.angle !== activeAngle,
      );
      if (next) setActiveAngle(next.angle);
    } finally {
      setIsCapturing(false);
    }
  };

  const retake = (angle: CameoAngle) => {
    const existing = shots[angle];
    if (existing) URL.revokeObjectURL(existing.previewUrl);
    const next = { ...shots };
    delete next[angle];
    onShotsChange(next);
    setActiveAngle(angle);
  };

  const activeStep =
    CAMEO_STEPS.find((step) => step.angle === activeAngle) ?? CAMEO_STEPS[0];
  const activeShot = shots[activeAngle];

  return (
    <div className="flex flex-col gap-4" data-ocid="cameo.panel">
      <div>
        <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
          {phase === "photos" ? "Guided camera cameo" : "Voice profile"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {phase === "photos"
            ? "Capture three angles in order. Each photo is stored and linked to the character."
            : "Read the phrase aloud so the character has a voice sample."}
        </p>
      </div>

      {phase === "photos" ? (
        <>
          <div className="flex flex-wrap gap-2" data-ocid="cameo.angle_tabs">
            {CAMEO_STEPS.map((step) => {
              const done = Boolean(shots[step.angle]);
              return (
                <button
                  key={step.angle}
                  type="button"
                  onClick={() => setActiveAngle(step.angle)}
                  data-ocid={`cameo.tab.${step.angle}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    activeAngle === step.angle
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5 text-status-completed" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-current" />
                  )}
                  {step.title}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-lg border border-border bg-terminal">
              <div className="aspect-square w-full">
                {activeShot ? (
                  <img
                    src={activeShot.previewUrl}
                    alt={`${activeStep.title} capture`}
                    className="size-full object-cover"
                  />
                ) : (
                  <video
                    ref={camera.videoRef}
                    playsInline
                    muted
                    className="size-full scale-x-[-1] object-cover"
                    data-ocid="cameo.preview"
                  />
                )}
              </div>
              <canvas ref={camera.canvasRef} className="hidden" />
              {!activeShot && camera.isActive ? (
                <span
                  aria-hidden="true"
                  className="camera-scanline pointer-events-none absolute inset-x-0 top-0"
                />
              ) : null}
              {!activeShot && camera.isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-terminal/70">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
                  {activeStep.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeStep.guidance}
                </p>
              </div>

              {camera.error ? (
                <p
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  data-ocid="cameo.error_state"
                >
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  {camera.error.message}
                </p>
              ) : null}

              {activeShot ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => retake(activeAngle)}
                  data-ocid="cameo.retake_button"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Retake photo
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleCapture()}
                  disabled={!camera.isActive || isCapturing}
                  data-ocid="cameo.capture_button"
                >
                  {isCapturing ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Camera className="size-4" aria-hidden="true" />
                  )}
                  Capture {activeStep.title.toLowerCase()}
                </Button>
              )}

              {camera.isSupported === false ? (
                <p className="text-xs text-muted-foreground">
                  This browser does not support camera capture. You can continue
                  with image upload instead.
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <VoiceProfileStep voice={voice} onChange={onVoiceChange} />
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={phase === "voice" ? () => setPhase("photos") : onBack}
          data-ocid="cameo.back_button"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (phase === "photos") {
              setPhase("voice");
            } else {
              onContinue();
            }
          }}
          data-ocid="cameo.continue_button"
        >
          {phase === "photos"
            ? allPhotosDone
              ? "Continue to voice"
              : "Skip remaining photos"
            : voice
              ? "Continue"
              : "Skip voice"}
        </Button>
      </div>
    </div>
  );
}
