import type { backendInterface } from "@/backend";

/**
 * Thin typed facade over the generated backend actor.
 *
 * The generated `backendInterface` is the source of truth for method
 * signatures. This wrapper exists so page code depends on a single stable
 * surface and so shared helpers (error normalization) live in one place.
 */
export type BackendClient = backendInterface;

export function createBackendClient(actor: backendInterface): BackendClient {
  return actor;
}

/** Normalizes a thrown backend error into a readable message. */
export function backendErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "The backend rejected the request. Please retry.";
}
