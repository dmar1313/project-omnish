import { AssetKind } from "@/backend";
import {
  assetKindFromFile,
  captureFileName,
  uploadMedia,
} from "@/lib/mediaCapture";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for the media adapter that character creation depends on.
 *
 * `uploadMedia` is the seam between a browser File and the platform object
 * storage contract: it must read the bytes, wrap them in an ExternalBlob, and
 * return the blob's direct URL as the plain-text `storageUrl` the backend
 * stores. The object-storage module is stubbed locally so no network is
 * touched; this proves the adapter's own transformation only.
 */

const blob = vi.hoisted(() => ({
  fromBytes: vi.fn(),
}));

vi.mock("@caffeineai/object-storage", () => ({
  ExternalBlob: {
    fromBytes: blob.fromBytes,
  },
}));

function makeBlobStub(directUrl: string) {
  return { getDirectURL: vi.fn(() => directUrl) };
}

describe("assetKindFromFile", () => {
  it("maps image, audio, and video MIME types to the backend enum", () => {
    expect(
      assetKindFromFile(new File([], "a.png", { type: "image/png" })),
    ).toBe(AssetKind.image);
    expect(
      assetKindFromFile(new File([], "a.webm", { type: "audio/webm" })),
    ).toBe(AssetKind.audio);
    expect(
      assetKindFromFile(new File([], "a.mp4", { type: "video/mp4" })),
    ).toBe(AssetKind.video);
  });

  it("falls back to image for an unknown MIME type", () => {
    expect(
      assetKindFromFile(
        new File([], "a.bin", { type: "application/octet-stream" }),
      ),
    ).toBe(AssetKind.image);
  });
});

describe("captureFileName", () => {
  it("derives a descriptive extension from the capture MIME type", () => {
    expect(captureFileName("front", "image/png")).toBe("cameo-front.png");
    expect(captureFileName("left", "image/webp")).toBe("cameo-left.webp");
    expect(captureFileName("right", "image/jpeg")).toBe("cameo-right.jpg");
  });
});

describe("uploadMedia", () => {
  beforeAll(() => {
    if (typeof File.prototype.arrayBuffer !== "function") {
      File.prototype.arrayBuffer = function arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      };
    }
  });

  it("returns the blob's direct URL, file name, and mapped kind", async () => {
    blob.fromBytes.mockReset();
    blob.fromBytes.mockImplementation(() =>
      makeBlobStub("https://storage.example/ref.png"),
    );

    const result = await uploadMedia(
      new File([new Uint8Array([1, 2, 3])], "ref.png", { type: "image/png" }),
    );

    expect(result).toEqual({
      storageUrl: "https://storage.example/ref.png",
      fileName: "ref.png",
      fileType: AssetKind.image,
    });
    expect(blob.fromBytes).toHaveBeenCalledTimes(1);
  });

  it("persists an uploaded video file and returns its playable direct URL", async () => {
    // Uploaded video files must go through platform storage like any other
    // media: the bytes are wrapped in an ExternalBlob and the blob's direct URL
    // is what the backend stores, so the run/video pages can play it back.
    blob.fromBytes.mockReset();
    blob.fromBytes.mockImplementation(() =>
      makeBlobStub("https://storage.example/clip.mp4"),
    );

    const result = await uploadMedia(
      new File([new Uint8Array([0, 1, 2, 3])], "clip.mp4", {
        type: "video/mp4",
      }),
    );

    expect(result).toEqual({
      storageUrl: "https://storage.example/clip.mp4",
      fileName: "clip.mp4",
      fileType: AssetKind.video,
    });
    expect(blob.fromBytes).toHaveBeenCalledTimes(1);
    expect(blob.fromBytes).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "video/mp4",
      "clip.mp4",
    );
  });

  it("reports progress from start to completion", async () => {
    blob.fromBytes.mockReset();
    blob.fromBytes.mockImplementation(() =>
      makeBlobStub("https://storage.example/ref.png"),
    );
    const onProgress = vi.fn();

    await uploadMedia(
      new File([new Uint8Array([1])], "ref.png", { type: "image/png" }),
      onProgress,
    );

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls[0][0]).toBeGreaterThan(0);
    expect(onProgress.mock.calls.at(-1)?.[0]).toBe(100);
  });
});
