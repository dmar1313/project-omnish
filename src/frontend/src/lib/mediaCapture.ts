import { AssetKind } from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";

/**
 * Shared media helpers for character creation.
 *
 * Uploads follow the platform object-storage contract: bytes are wrapped in an
 * `ExternalBlob`, and the blob's direct URL is persisted as the plain-text
 * `storageUrl` on the linked asset ingredient.
 */

export interface UploadedMedia {
  storageUrl: string;
  fileName: string;
  fileType: AssetKind;
}

/** Maps a browser File to the backend's asset kind enum. */
export function assetKindFromFile(file: File): AssetKind {
  if (file.type.startsWith("video/")) return AssetKind.video;
  if (file.type.startsWith("audio/")) return AssetKind.audio;
  return AssetKind.image;
}

/**
 * Persists a file through platform storage and resolves its direct URL.
 *
 * `onProgress` is driven by the real async work (byte read → storage handle)
 * so the UI can show honest transfer feedback.
 */
export async function uploadMedia(
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<UploadedMedia> {
  onProgress?.(8);
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress?.(55);
  const blob = ExternalBlob.fromBytes(bytes, file.type, file.name);
  const storageUrl = blob.getDirectURL();
  onProgress?.(100);
  return {
    storageUrl,
    fileName: file.name,
    fileType: assetKindFromFile(file),
  };
}

export interface UploadedVideo {
  storageUrl: string;
  mimeType: string;
  durationSeconds: number;
  aspectRatio: string;
}

/** Greatest common divisor, used to reduce a pixel ratio to its simplest form. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Reduces a width/height pair to a canonical "W:H" string (e.g. "9:16"). */
export function aspectRatioFromDimensions(
  width: number,
  height: number,
): string {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "16:9";
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return "16:9";
  const divisor = gcd(w, h) || 1;
  return `${w / divisor}:${h / divisor}`;
}

/**
 * Reads a video file's real duration and pixel dimensions via a temporary
 * `<video>` element, so an artifact carries values derived from the media
 * itself rather than from any text heuristic.
 */
export function readVideoMetadata(
  file: File,
): Promise<{ durationSeconds: number; aspectRatio: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement("video");
    element.preload = "metadata";
    element.muted = true;

    const cleanup = () => {
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };

    element.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(element.duration)
        ? element.duration
        : 0;
      const aspectRatio = aspectRatioFromDimensions(
        element.videoWidth,
        element.videoHeight,
      );
      cleanup();
      resolve({ durationSeconds, aspectRatio });
    };

    element.onerror = () => {
      cleanup();
      resolve({ durationSeconds: 0, aspectRatio: "16:9" });
    };

    element.src = url;
  });
}

/**
 * Uploads a video file through platform storage and resolves its real
 * playable URL plus the metadata (duration, aspect ratio) read from the file.
 */
export async function uploadVideo(
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<UploadedVideo> {
  onProgress?.(5);
  const metadata = await readVideoMetadata(file);
  onProgress?.(35);
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress?.(70);
  const blob = ExternalBlob.fromBytes(bytes, file.type, file.name);
  const storageUrl = blob.getDirectURL();
  onProgress?.(100);
  return {
    storageUrl,
    mimeType: file.type || "video/mp4",
    durationSeconds: metadata.durationSeconds,
    aspectRatio: metadata.aspectRatio,
  };
}

/** Builds a stable, descriptive file name for a captured cameo frame. */
export function captureFileName(angle: string, mimeType: string): string {
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";
  return `cameo-${angle}.${ext}`;
}

export interface VoiceRecorder {
  start: () => Promise<void>;
  stop: () => Promise<File | null>;
  cancel: () => void;
  dispose: () => void;
}

function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Minimal MediaRecorder wrapper with a live input-level meter.
 *
 * The level callback receives a 0–1 value derived from the analyser's
 * frequency data, which drives the on-screen recording feedback.
 */
export function createVoiceRecorder(
  onLevel?: (level: number) => void,
): VoiceRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let rafId = 0;

  const stopTracks = () => {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    stream = null;
  };

  const stopMeter = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    analyser = null;
    if (audioContext) void audioContext.close();
    audioContext = null;
  };

  const start = async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    const mimeType = pickAudioMime();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) sum += value;
      onLevel?.(Math.min(1, sum / data.length / 128));
      rafId = requestAnimationFrame(tick);
    };
    tick();
  };

  const stop = async (): Promise<File | null> => {
    const active = recorder;
    if (!active) return null;
    const finished = new Promise<Blob>((resolve) => {
      active.onstop = () =>
        resolve(new Blob(chunks, { type: active.mimeType || "audio/webm" }));
    });
    active.stop();
    const blob = await finished;
    stopMeter();
    stopTracks();
    recorder = null;
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    return new File([blob], `voice-sample.${ext}`, { type: blob.type });
  };

  const cancel = () => {
    try {
      recorder?.stop();
    } catch {
      // Recorder already stopped — nothing to clean up.
    }
    recorder = null;
    stopMeter();
    stopTracks();
  };

  return { start, stop, cancel, dispose: cancel };
}
