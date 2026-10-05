import { createMockActor, createTestQueryClient } from "@/test/helpers";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeleteMediaArtifact } from "@/hooks/useQueries";

/**
 * API-consumer contract for the delete-video mutation. The hook is the seam
 * between the UI and the generated actor: it must call the real
 * `deleteMediaArtifact(runId)` method and invalidate the run, artifact, and
 * runs queries so the deleted video drops out of every surface.
 *
 * The actor is a local typed mock, so this proves the consumer contract, not
 * the real canister.
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

describe("useDeleteMediaArtifact", () => {
  beforeEach(() => {
    infra.actor = createMockActor();
  });

  it("calls the generated deleteMediaArtifact method with the run id", async () => {
    const actor = createMockActor({
      deleteMediaArtifact: vi.fn(async () => true),
    });
    infra.actor = actor;
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useDeleteMediaArtifact(), {
      wrapper: wrapper(queryClient),
    });

    const removed = await result.current.mutateAsync(7n);

    expect(removed).toBe(true);
    expect(actor.deleteMediaArtifact).toHaveBeenCalledWith(7n);
  });

  it("invalidates the run, artifact, and runs queries after a delete", async () => {
    const actor = createMockActor({
      deleteMediaArtifact: vi.fn(async () => true),
    });
    infra.actor = actor;
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMediaArtifact(), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync(7n);

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
      deleteMediaArtifact: vi.fn(async () => {
        throw new Error("not authorized");
      }),
    });
    infra.actor = actor;
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useDeleteMediaArtifact(), {
      wrapper: wrapper(queryClient),
    });

    await expect(result.current.mutateAsync(7n)).rejects.toThrow(
      "not authorized",
    );
  });
});
