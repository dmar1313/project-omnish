import { type Backend, UserRole } from "@/backend";
import { createMockActor, createTestQueryClient } from "@/test/helpers";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the test-only sign-in registration seam in `useBackend`.
 *
 * The accepted behavior: the deterministic test principal is a real Ed25519
 * principal the backend has never seen, so every guarded read/write traps
 * "User is not registered" until `_initialize_access_control` has run for it.
 * `ensureTestPrincipalRegistered` performs that registration exactly once and
 * `useUserRole` awaits it before reading the caller's role. With the test-only
 * flag off the seam is inert, so the real Internet Identity flow is untouched.
 *
 * The backend actor is a local typed mock, so this proves the consumer contract
 * (the registration call is made, once, before the guarded read), not the real
 * canister. The PocketIC lane covers the real `_initialize_access_control` and
 * `getCallerUserRole` methods.
 */

const infra = vi.hoisted(() => ({
  isAuthenticated: false,
  isInitializing: false,
  actor: null as unknown,
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useInternetIdentity: () => ({
    isAuthenticated: infra.isAuthenticated,
    isInitializing: infra.isInitializing,
    identity: undefined,
    clear: vi.fn(),
    login: vi.fn(),
  }),
  useActor: () => ({ actor: infra.actor, isFetching: false }),
}));

function setTestSignInFlag(enabled: boolean) {
  if (enabled) {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = "true";
    // `isTestSignInActive` reads the persisted activation, so the flag alone is
    // not enough: the tester must have activated the test path.
    window.localStorage.setItem("omnish.testSignIn", "true");
  } else {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = undefined;
    window.localStorage.removeItem("omnish.testSignIn");
  }
}

/**
 * `ensureTestPrincipalRegistered` memoizes its in-flight promise at module
 * scope, so each test re-imports the module to start from a clean registration
 * state. The flag is read at call time, so it is set before the import.
 */
async function loadUseBackend() {
  vi.resetModules();
  return import("@/hooks/useBackend");
}

function queryWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * The seam takes the generated `Backend` class, whose public methods are the
 * `backendInterface` surface. The mock only implements that surface, so it is
 * cast at the boundary rather than widening the production signature.
 */
function asBackend(actor: ReturnType<typeof createMockActor>): Backend {
  return actor as unknown as Backend;
}

describe("ensureTestPrincipalRegistered", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setTestSignInFlag(false);
  });

  afterEach(() => {
    setTestSignInFlag(false);
    window.localStorage.clear();
  });

  it("is inert when the test-only path is not active", async () => {
    const { ensureTestPrincipalRegistered } = await loadUseBackend();
    const actor = createMockActor({
      _initialize_access_control: vi.fn(async () => undefined),
    });

    await ensureTestPrincipalRegistered(asBackend(actor));

    // The real Internet Identity flow registers its caller during sign-in, so
    // the seam must not touch the backend when the test path is off.
    expect(actor._initialize_access_control).not.toHaveBeenCalled();
  });

  it("registers the test principal once before guarded calls", async () => {
    setTestSignInFlag(true);
    const { ensureTestPrincipalRegistered } = await loadUseBackend();
    const actor = createMockActor({
      _initialize_access_control: vi.fn(async () => undefined),
    });

    await ensureTestPrincipalRegistered(asBackend(actor));

    expect(actor._initialize_access_control).toHaveBeenCalledTimes(1);
  });

  it("memoizes registration so concurrent guarded calls share one call", async () => {
    setTestSignInFlag(true);
    const { ensureTestPrincipalRegistered } = await loadUseBackend();
    const actor = createMockActor({
      _initialize_access_control: vi.fn(async () => undefined),
    });

    await Promise.all([
      ensureTestPrincipalRegistered(asBackend(actor)),
      ensureTestPrincipalRegistered(asBackend(actor)),
      ensureTestPrincipalRegistered(asBackend(actor)),
    ]);

    // `_initialize_access_control` is idempotent, but racing it would still be
    // wasteful; the memoized promise means every guarded call awaits the same
    // registration.
    expect(actor._initialize_access_control).toHaveBeenCalledTimes(1);
  });

  it("allows a later attempt to retry after a transient registration failure", async () => {
    setTestSignInFlag(true);
    const { ensureTestPrincipalRegistered } = await loadUseBackend();
    const actor = createMockActor({
      _initialize_access_control: vi
        .fn()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValue(undefined),
    });

    await expect(
      ensureTestPrincipalRegistered(asBackend(actor)),
    ).rejects.toThrow("transient");
    // The failed promise is cleared, so the next guarded call retries rather
    // than inheriting a permanently rejected registration.
    await expect(
      ensureTestPrincipalRegistered(asBackend(actor)),
    ).resolves.toBeUndefined();
    expect(actor._initialize_access_control).toHaveBeenCalledTimes(2);
  });
});

describe("useUserRole", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setTestSignInFlag(false);
    infra.isAuthenticated = false;
    infra.isInitializing = false;
  });

  afterEach(() => {
    setTestSignInFlag(false);
    window.localStorage.clear();
  });

  it("registers the test principal before reading the caller's role", async () => {
    setTestSignInFlag(true);
    const { useUserRole } = await loadUseBackend();
    const actor = createMockActor({
      _initialize_access_control: vi.fn(async () => undefined),
      getCallerUserRole: vi.fn(async () => UserRole.user),
    });
    infra.actor = actor;

    const { result } = renderHook(() => useUserRole(), {
      wrapper: queryWrapper,
    });

    await waitFor(() => {
      expect(result.current.role).toBe(UserRole.user);
    });

    // The registration ran before the guarded role read, which is what keeps
    // the deterministic principal from trapping "User is not registered".
    expect(actor._initialize_access_control).toHaveBeenCalledTimes(1);
    expect(actor.getCallerUserRole).toHaveBeenCalledTimes(1);
  });

  it("does not register when the test-only path is inactive", async () => {
    const { useUserRole } = await loadUseBackend();
    const actor = createMockActor({
      _initialize_access_control: vi.fn(async () => undefined),
      getCallerUserRole: vi.fn(async () => UserRole.user),
    });
    infra.actor = actor;
    infra.isAuthenticated = true;

    const { result } = renderHook(() => useUserRole(), {
      wrapper: queryWrapper,
    });

    await waitFor(() => {
      expect(result.current.role).toBe(UserRole.user);
    });

    // A real Internet Identity caller is registered by the sign-in flow, so the
    // test seam must not call `_initialize_access_control` for it.
    expect(actor._initialize_access_control).not.toHaveBeenCalled();
  });
});
