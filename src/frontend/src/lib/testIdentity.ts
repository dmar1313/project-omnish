import type {
  CreateActorOptions,
  createActorFunction,
} from "@caffeineai/core-infrastructure";
import { HttpAgent, type Identity } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

/**
 * Test-only identity seam.
 *
 * When `VITE_ENABLE_TEST_SIGNIN === "true"` the app injects a deterministic
 * Ed25519 identity so a tester can reach the authenticated workspace without a
 * real Internet Identity credential. The flag is off in normal production and
 * test builds, so this module is inert there and the real Internet Identity
 * flow is untouched.
 *
 * The identity is derived from a fixed 32-byte seed, so every test run signs in
 * as the same principal. It is a real signing identity (not an anonymous one),
 * so `useActor(createActor)` builds a real actor against the backend.
 */

/** Fixed 32-byte seed — deterministic, test-only, never a production secret. */
const TEST_IDENTITY_SEED = new Uint8Array([
  0x6f, 0x6d, 0x6e, 0x69, 0x73, 0x68, 0x2d, 0x74, 0x65, 0x73, 0x74, 0x2d, 0x69,
  0x64, 0x65, 0x6e, 0x74, 0x69, 0x74, 0x79, 0x2d, 0x73, 0x65, 0x65, 0x64, 0x2d,
  0x30, 0x30, 0x30, 0x31, 0x00, 0x00,
]);

let cachedIdentity: Identity | null = null;

const testSignInListeners = new Set<() => void>();

/** Storage key for the persisted test-only activation. */
const TEST_SIGNIN_STORAGE_KEY = "omnish.testSignIn";

/**
 * In-memory activation fallback. Some isolated test browsers expose a
 * `localStorage` that throws on access (or is absent entirely), which would
 * otherwise make `activateTestSignIn` a silent no-op and leave the tester stuck
 * on the gate. This flag keeps the activation alive for the lifetime of the
 * page so the authenticated surfaces are still reachable; persistence across a
 * reload is best-effort and only available when storage works.
 */
let memoryActivation = false;

/** True only when the test-only sign-in flag is enabled at build time. */
export function isTestSignInEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_TEST_SIGNIN === "true";
}

/**
 * Hosts that serve the production app to real users. The test-only sign-in
 * path is never shown on these, regardless of the build-time flag, so a real
 * user can never reach the deterministic test identity.
 *
 * `caffeine.ai` and its subdomains are Caffeine's production hosting surface
 * (live apps and custom domains). The draft preview and the isolated test build
 * are served from canister hosts (`*.icp0.io`, `*.ic0.app`) and local hosts,
 * which are not listed here.
 */
const PRODUCTION_HOST_SUFFIXES = ["caffeine.ai"];

/** True when the current page is served from a production host. */
function isProductionHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return PRODUCTION_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

/**
 * Whether the test-only sign-in path may be shown on this page.
 *
 * This is the gate the UI reads. It is true only when the build-time flag is
 * enabled AND the page is not served from a production host, so the deployed
 * preview and the isolated test build expose the path while the live app never
 * does. The tester still has to activate it explicitly.
 */
export function isTestSignInAvailable(): boolean {
  return isTestSignInEnabled() && !isProductionHost();
}

/**
 * Reads the persisted test-only activation. Guarded by the build-time flag and
 * wrapped in try/catch so a locked-down storage API can never break the app.
 * Falls back to the in-memory activation when storage is unavailable.
 */
function readPersistedActivation(): boolean {
  if (!isTestSignInAvailable()) return false;
  try {
    // When storage works it is the single source of truth, so the in-memory
    // fallback can never leak an activation past a cleared storage.
    return window.localStorage.getItem(TEST_SIGNIN_STORAGE_KEY) === "true";
  } catch {
    // Storage is unavailable (locked down or absent): fall back to memory.
    return memoryActivation;
  }
}

/**
 * Subscribes to test-only sign-in activations. The root gate uses this to
 * re-render once the tester activates the test path. Returns an unsubscribe
 * function. Inert when the flag is disabled.
 */
export function subscribeTestSignIn(listener: () => void): () => void {
  testSignInListeners.add(listener);
  return () => {
    testSignInListeners.delete(listener);
  };
}

/**
 * Whether the test-only sign-in path is currently active. Persisted across
 * reloads so manual verification is not fragile. Always `false` when the flag
 * is disabled, so a production build can never report an active test session.
 */
export function isTestSignInActive(): boolean {
  return readPersistedActivation();
}

/**
 * Activates the test-only sign-in path. No-op unless the flag is enabled, so a
 * production build can never reach the test identity. Persists the activation
 * so it survives a page reload, then notifies subscribers so the root gate
 * re-evaluates and renders the authenticated workspace.
 */
export function activateTestSignIn(): void {
  if (!isTestSignInAvailable()) return;
  // Always set the in-memory activation first so the gate opens even when
  // storage is unavailable; persistence is a best-effort bonus.
  memoryActivation = true;
  try {
    window.localStorage.setItem(TEST_SIGNIN_STORAGE_KEY, "true");
  } catch {
    /* best-effort persistence */
  }
  for (const listener of testSignInListeners) {
    listener();
  }
}

/**
 * Clears the persisted test-only activation. No-op unless the flag is enabled.
 * Used by the test-only sign-out affordance so a tester can return to the gate.
 */
export function deactivateTestSignIn(): void {
  if (!isTestSignInEnabled()) return;
  memoryActivation = false;
  try {
    window.localStorage.removeItem(TEST_SIGNIN_STORAGE_KEY);
  } catch {
    /* best-effort persistence */
  }
  for (const listener of testSignInListeners) {
    listener();
  }
}

/**
 * Returns the deterministic test identity, or `null` when the test-only path is
 * unavailable. The identity is memoized so the principal is stable across
 * renders. Gated on `isTestSignInAvailable`, so a production host can never
 * mint the test identity even if the build-time flag is on.
 */
export function getTestIdentity(): Identity | null {
  if (!isTestSignInAvailable()) return null;
  if (!cachedIdentity) {
    cachedIdentity = Ed25519KeyIdentity.generate(TEST_IDENTITY_SEED);
  }
  return cachedIdentity;
}

/**
 * Builds an `HttpAgent` bound to the test identity. Returns `null` when the
 * test-only flag is disabled, so callers fall through to the real flow.
 */
export function createTestAgent(): HttpAgent | null {
  const identity = getTestIdentity();
  if (!identity) return null;
  return HttpAgent.createSync({ identity });
}

/**
 * Wraps a generated `createActor` so that, when the test-only path is
 * available, the actor is built against the deterministic test identity. When
 * the path is unavailable (flag off, or a production host) it delegates to the
 * original factory unchanged, so production behavior is identical to calling
 * `createActor` directly.
 *
 * `useActor` routes every actor through `createActorWithConfig`, which builds a
 * fresh anonymous `HttpAgent` and sets it as `options.agent` BEFORE invoking the
 * wrapped factory. The generated `createActor` then evaluates
 * `options.agent || HttpAgent.createSync({ ...options.agentOptions })`, so the
 * anonymous agent always wins and an `agentOptions.identity` injection is a
 * silent no-op. The identity must therefore be applied to the agent that
 * `createActorWithConfig` already built: `HttpAgent.replaceIdentity` swaps the
 * agent's identity in place while preserving the host `createActorWithConfig`
 * resolved (mainnet or local replica). When no agent is present (a direct
 * `createActor` call outside `useActor`) we fall back to `agentOptions.identity`
 * so the generated factory constructs a test-identity agent itself.
 */
export function createTestAwareActor<T>(
  createActor: createActorFunction<T>,
): createActorFunction<T> {
  return (
    canisterId,
    uploadFile,
    downloadFile,
    options: CreateActorOptions,
  ) => {
    const identity = getTestIdentity();
    if (!identity) {
      return createActor(canisterId, uploadFile, downloadFile, options);
    }
    const existingAgent = options?.agent;
    if (existingAgent instanceof HttpAgent) {
      existingAgent.replaceIdentity(identity);
      return createActor(canisterId, uploadFile, downloadFile, options);
    }
    return createActor(canisterId, uploadFile, downloadFile, {
      ...options,
      agentOptions: {
        ...options?.agentOptions,
        identity,
      },
    });
  };
}
