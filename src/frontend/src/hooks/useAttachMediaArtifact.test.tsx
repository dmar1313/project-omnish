import { createMockActor, createTestQueryClient } from "@/test/helpers";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAttachMediaArtifact } from "@/hooks/useQueries";

/**
 * API-consumer contract for the attach/replace-video mutation. The hook is the
 * seam between the UI and the generated actor: it must call the real
 * `attachMediaArtifact(input)` method and invalidate the run, artifact, and
 * runs queries so the newly attached (or replaced) media reaches every surface.
 *
 * The actor is a local typed mock, so this proves the consumer contract, not
 * the real canister. The PocketIC lane covers the real method.
 */

const infra = vi.hoisted(() => ({
  actor: null as unknown,
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: infra.actor, isFetching: false }),
}));

function wrapper(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const attachInput = {
  runId: 7n,
  storageUrl: "https://storage.example/run-7.mp4",
  mimeType: "video/mp4",
  durationSeconds: 42,
  aspectRatio: "9:16",
  cameoId: undefined,
};

describe("useAttachMediaArtifact", () => {
  beforeEach(() => {
    infra.actor = createMockActor();
  });

  it("calls the generated attachMediaArtifact method with the input", async () => {
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => null),
    });
    infra.actor = actor;
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAttachMediaArtifact(), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync(attachInput);

    expect(actor.attachMediaArtifact).toHaveBeenCalledWith(attachInput);
  });

  it("invalidates the run, artifact, and runs queries after an attach", async () => {
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => null),
    });
    infra.actor = actor;
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAttachMediaArtifact(), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync(attachInput);

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["run", "7"] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["mediaArtifact", "7"],
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["runs"] });
    });
  });

  it("surfaces a backend rejection to the caller", async () => {
    const actor = createMockActor({
      attachMediaArtifact: vi.fn(async () => {
        throw new Error("not authorized");
      }),
    });
    infra.actor = actor;
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAttachMediaArtifact(), {
      wrapper: wrapper(queryClient),
    });

    await expect(result.current.mutateAsync(attachInput)).rejects.toThrow(
      "not authorized",
    );
  });
});
