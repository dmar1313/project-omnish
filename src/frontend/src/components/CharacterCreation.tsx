import type { AssetIngredient, DnaInput, DnaRecord, Id } from "@/backend";
import {
  type CameoAngle,
  CameoCapture,
  type CameoShot,
} from "@/components/CameoCapture";
import { DnaForm } from "@/components/DnaForm";
import { type ImageDraft, ImageUploadStep } from "@/components/ImageUploadStep";
import type { VoiceDraft } from "@/components/VoiceProfileStep";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  useCreateAsset,
  useCreateCameo,
  useCreateDna,
} from "@/hooks/useQueries";
import { backendErrorMessage } from "@/lib/backendClient";
import { uploadMedia } from "@/lib/mediaCapture";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  ShieldAlert,
  Sparkles,
  Type,
  UserRound,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Method = "text" | "image" | "camera";
type Step = "method" | "details" | "capture" | "review";

type ShotDraft = CameoShot;

export interface CharacterCreationProps {
  /** Called after the character and its linked media are persisted. */
  onCreated: (record: DnaRecord) => void;
  onCancel: () => void;
}

const METHOD_META: Record<
  Method,
  { label: string; blurb: string; icon: typeof Type }
> = {
  text: {
    label: "Text description",
    blurb: "Define the character through written identity and traits.",
    icon: Type,
  },
  image: {
    label: "Image upload",
    blurb: "Upload one or more reference images from your device.",
    icon: ImagePlus,
  },
  camera: {
    label: "Camera cameo",
    blurb: "Capture front, left, and right photos, then a voice sample.",
    icon: Camera,
  },
};

const CAMEO_ANGLES: CameoAngle[] = ["front", "left", "right"];

export function CharacterCreation({
  onCreated,
  onCancel,
}: CharacterCreationProps) {
  const createDna = useCreateDna();
  const createAsset = useCreateAsset();
  const createCameo = useCreateCameo();

  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method | null>(null);
  const [details, setDetails] = useState<DnaInput | null>(null);
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [shots, setShots] = useState<Partial<Record<CameoAngle, ShotDraft>>>(
    {},
  );
  const [voice, setVoice] = useState<VoiceDraft | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSubmitting = progress !== null;

  const goToCapture = (nextMethod: Method) => {
    setMethod(nextMethod);
    setStep(nextMethod === "text" ? "review" : "capture");
  };

  const handleDetails = (input: DnaInput) => {
    setDetails(input);
    if (method) goToCapture(method);
  };

  const handleCreate = async () => {
    if (!details) return;
    setErrorMessage(null);
    setProgress(0);
    try {
      setProgressLabel("Registering character");
      const record = await createDna.mutateAsync(details);
      setProgress(10);

      const total = images.length + Object.keys(shots).length + (voice ? 1 : 0);
      let done = 0;
      const bump = () => {
        done += 1;
        setProgress(10 + Math.round((done / Math.max(total, 1)) * 80));
      };

      for (const image of images) {
        setProgressLabel(`Uploading ${image.file.name}`);
        await persistAsset(image.file, record.id, ["reference"]);
        bump();
      }

      const shotIds: Partial<Record<CameoAngle, Id>> = {};
      for (const angle of CAMEO_ANGLES) {
        const shot = shots[angle];
        if (!shot) continue;
        setProgressLabel(`Uploading ${angle} photo`);
        const asset = await persistAsset(shot.file, record.id, [
          "cameo",
          angle,
        ]);
        shotIds[angle] = asset.id;
        bump();
      }

      let voiceId: Id | undefined;
      if (voice) {
        setProgressLabel("Uploading voice sample");
        const asset = await persistAsset(voice.file, record.id, [
          "cameo",
          "voice",
        ]);
        voiceId = asset.id;
        bump();
      }

      if (Object.keys(shotIds).length > 0 || voiceId !== undefined) {
        setProgressLabel("Recording cameo");
        await createCameo.mutateAsync({
          characterId: record.id,
          frontAssetId: shotIds.front,
          leftAssetId: shotIds.left,
          rightAssetId: shotIds.right,
          voiceAssetId: voiceId,
        });
      }

      setProgress(100);
      toast.success(`${record.characterName} established`);
      onCreated(record);
    } catch (error) {
      setErrorMessage(backendErrorMessage(error));
    } finally {
      setProgress(null);
      setProgressLabel("");
    }
  };

  const persistAsset = async (
    file: File,
    characterId: Id,
    tags: string[],
  ): Promise<AssetIngredient> => {
    const uploaded = await uploadMedia(file);
    return createAsset.mutateAsync({
      fileName: uploaded.fileName,
      fileType: uploaded.fileType,
      storageUrl: uploaded.storageUrl,
      tags,
      linkedCharacterId: characterId,
    });
  };

  const stepIndex = ["method", "details", "capture", "review"].indexOf(step);

  return (
    <div className="flex flex-col gap-5" data-ocid="character_creation.panel">
      <Stepper current={stepIndex} method={method} />

      {step === "method" ? (
        <MethodStep
          onSelect={(next) => {
            setMethod(next);
            setStep("details");
          }}
        />
      ) : null}

      {step === "details" ? (
        <div className="flex flex-col gap-4">
          <StepIntro
            title="Describe the character"
            body="The name is required. Text descriptors are optional — you can define the character through media instead."
          />
          <DnaForm
            key="creation-details"
            onSubmit={handleDetails}
            onCancel={onCancel}
            isPending={false}
            optionalFields
            submitLabel="Continue"
          />
        </div>
      ) : null}

      {step === "capture" && method === "image" ? (
        <ImageUploadStep
          images={images}
          onChange={setImages}
          onBack={() => setStep("details")}
          onContinue={() => setStep("review")}
        />
      ) : null}

      {step === "capture" && method === "camera" ? (
        <CameoCapture
          shots={shots}
          voice={voice}
          onShotsChange={setShots}
          onVoiceChange={setVoice}
          onBack={() => setStep("details")}
          onContinue={() => setStep("review")}
        />
      ) : null}

      {step === "review" ? (
        <ReviewStep
          details={details}
          method={method}
          images={images}
          shots={shots}
          voice={voice}
          isSubmitting={isSubmitting}
          progress={progress}
          progressLabel={progressLabel}
          errorMessage={errorMessage}
          onBack={() => setStep(method === "text" ? "details" : "capture")}
          onSubmit={() => void handleCreate()}
        />
      ) : null}
    </div>
  );
}

function Stepper({
  current,
  method,
}: { current: number; method: Method | null }) {
  const labels = ["Method", "Details", "Capture", "Review"];
  const visible = method === "text" ? [0, 1, 3] : [0, 1, 2, 3];
  return (
    <ol
      className="flex flex-wrap items-center gap-2"
      data-ocid="character_creation.stepper"
    >
      {visible.map((index, position) => {
        const active = index === current;
        const complete = index < current;
        return (
          <li key={labels[index]} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border font-mono text-[10px]",
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : complete
                    ? "border-status-completed/50 bg-status-completed/10 text-status-completed"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {complete ? <Check className="size-3" /> : position + 1}
            </span>
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-wider",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {labels[index]}
            </span>
            {position < visible.length - 1 ? (
              <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function MethodStep({ onSelect }: { onSelect: (method: Method) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <StepIntro
        title="Choose an input method"
        body="Pick how you want to define this character. You can combine text with media later."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(METHOD_META) as Method[]).map((key) => {
          const meta = METHOD_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              data-ocid={`character_creation.method.${key}`}
              className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="flex size-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="font-display text-sm font-semibold text-foreground">
                {meta.label}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {meta.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewStep({
  details,
  method,
  images,
  shots,
  voice,
  isSubmitting,
  progress,
  progressLabel,
  errorMessage,
  onBack,
  onSubmit,
}: {
  details: DnaInput | null;
  method: Method | null;
  images: ImageDraft[];
  shots: Partial<Record<CameoAngle, ShotDraft>>;
  voice: VoiceDraft | null;
  isSubmitting: boolean;
  progress: number | null;
  progressLabel: string;
  errorMessage: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const shotCount = Object.keys(shots).length;
  return (
    <div className="flex flex-col gap-4">
      <StepIntro
        title="Review and establish"
        body="Confirm the character and its linked media before creating it."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          icon={UserRound}
          label="Character"
          value={details?.characterName ?? "Untitled"}
        />
        <SummaryCard
          icon={Sparkles}
          label="Input method"
          value={method ? METHOD_META[method].label : "—"}
        />
        <SummaryCard
          icon={ImagePlus}
          label="Reference images"
          value={images.length > 0 ? `${images.length} linked` : "None"}
        />
        <SummaryCard
          icon={Video}
          label="Cameo"
          value={
            shotCount > 0 || voice
              ? `${shotCount} photo${shotCount === 1 ? "" : "s"}${voice ? " + voice" : ""}`
              : "None"
          }
        />
      </div>

      {details &&
      (details.identityBlocks ||
        details.immutableTraits ||
        details.visualMarkers) ? (
        <dl className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          {details.identityBlocks ? (
            <SummaryRow
              label="Identity blocks"
              value={details.identityBlocks}
            />
          ) : null}
          {details.immutableTraits ? (
            <SummaryRow
              label="Immutable traits"
              value={details.immutableTraits}
            />
          ) : null}
          {details.visualMarkers ? (
            <SummaryRow label="Visual markers" value={details.visualMarkers} />
          ) : null}
        </dl>
      ) : null}

      {progress !== null ? (
        <div
          className="flex flex-col gap-1.5"
          data-ocid="character_creation.loading_state"
        >
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{progressLabel || "Working"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      ) : null}

      {errorMessage ? (
        <p
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-ocid="character_creation.error_state"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          data-ocid="character_creation.back_button"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || !details}
          data-ocid="character_creation.submit_button"
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          Establish character
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-sm text-foreground">
        {value}
      </dd>
    </div>
  );
}

/** Route-level shell for the multi-method character creation flow. */
export function CharacterCreationPage() {
  const navigate = useNavigate();
  return (
    <div
      className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-6"
      data-ocid="character_creation.page"
    >
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <UserRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Character Creation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Establish a character from text, reference images, or a guided
            camera cameo with a voice sample.
          </p>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-card p-4 shadow-panel sm:p-6">
        <CharacterCreation
          onCreated={() => {
            void navigate({ to: "/dna" });
          }}
          onCancel={() => {
            void navigate({ to: "/dna" });
          }}
        />
      </div>
    </div>
  );
}
