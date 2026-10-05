import {
  activateTestSignIn,
  createTestAgent,
  createTestAwareActor,
  deactivateTestSignIn,
  getTestIdentity,
  isTestSignInActive,
  isTestSignInAvailable,
  isTestSignInEnabled,
  subscribeTestSignIn,
} from "@/lib/testIdentity";
import type { createActorFunction } from "@caffeineai/core-infrastructure";
import { HttpAgent } from "@icp-sdk/core/agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A typed actor factory mock, so `mock.calls` carries the real signature. */
function actorFactoryMock(result: string) {
  return vi.fn<createActorFunction<string>>(() => result);
}

/**
 * Test-only sign-in seam.
 *
 * The seam is gated behind `VITE_ENABLE_TEST_SIGNIN`. With the flag off it must
 * be completely inert so a production build can never reach the test identity
 * or report an active test session. With the flag on it must expose a
 * deterministic identity and a persisted activation the root gate can observe.
 *
 * These tests mutate `import.meta.env` directly, which is the same object the
 * production module reads at call time.
 */

const STORAGE_KEY = "omnish.testSignIn";

function setFlag(enabled: boolean) {
  if (enabled) {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = "true";
  } else {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = undefined;
  }
}

describe("testIdentity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setFlag(false);
  });

  afterEach(() => {
    setFlag(false);
    window.localStorage.clear();
  });

  describe("with the test-only flag disabled", () => {
    it("reports the flag as disabled", () => {
      expect(isTestSignInEnabled()).toBe(false);
    });

    it("never yields a test identity or agent", () => {
      expect(getTestIdentity()).toBeNull();
      expect(createTestAgent()).toBeNull();
    });

    it("ignores activation and never reports an active test session", () => {
      activateTestSignIn();

      expect(isTestSignInActive()).toBe(false);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("delegates the actor factory to the original unchanged", () => {
      const original = vi.fn(() => "real-actor");
      const wrapped = createTestAwareActor(
        original as unknown as Parameters<typeof createTestAwareActor>[0],
      );

      const uploadFile = vi.fn(async () => new Uint8Array());
      const downloadFile = vi.fn(async () => ({}) as never);
      const result = wrapped(
        "canister-id" as never,
        uploadFile,
        downloadFile,
        {} as never,
      );

      expect(result).toBe("real-actor");
      expect(original).toHaveBeenCalledTimes(1);
    });
  });

  describe("with the test-only flag enabled", () => {
    beforeEach(() => {
      setFlag(true);
    });

    it("reports the flag as enabled", () => {
      expect(isTestSignInEnabled()).toBe(true);
    });

    it("returns a stable deterministic identity", () => {
      const first = getTestIdentity();
      const second = getTestIdentity();

      expect(first).not.toBeNull();
      expect(second).toBe(first);
      // A real signing identity, not the anonymous principal.
      expect(first?.getPrincipal().isAnonymous()).toBe(false);
    });

    it("persists activation and reports it active", () => {
      expect(isTestSignInActive()).toBe(false);

      activateTestSignIn();

      expect(isTestSignInActive()).toBe(true);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
    });

    it("notifies subscribers on activation and deactivation", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeTestSignIn(listener);

      activateTestSignIn();
      expect(listener).toHaveBeenCalledTimes(1);

      deactivateTestSignIn();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(isTestSignInActive()).toBe(false);

      unsubscribe();
      activateTestSignIn();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("builds an agent bound to the test identity", () => {
      const agent = createTestAgent();
      expect(agent).not.toBeNull();
    });
  });

  describe("on a production host", () => {
    // The deployed preview and the isolated test build are served from canister
    // and local hosts; the live app is served from Caffeine's production
    // domain. The test-only path must never be reachable on production, even
    // when the build-time flag is on.
    const originalHostname = window.location.hostname;

    function setHostname(hostname: string) {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, hostname },
      });
    }

    beforeEach(() => {
      setFlag(true);
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, hostname: originalHostname },
      });
    });

    it("reports the path as unavailable on the production domain", () => {
      setHostname("my-app.caffeine.ai");

      expect(isTestSignInEnabled()).toBe(true);
      expect(isTestSignInAvailable()).toBe(false);
    });

    it("never mints the test identity on the production domain", () => {
      setHostname("my-app.caffeine.ai");

      expect(getTestIdentity()).toBeNull();
      expect(createTestAgent()).toBeNull();
    });

    it("ignores activation on the production domain", () => {
      setHostname("my-app.caffeine.ai");

      activateTestSignIn();

      expect(isTestSignInActive()).toBe(false);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("keeps the path available on a canister preview host", () => {
      setHostname("4caro-hl777-77775-aaaba-cai.icp0.io");

      expect(isTestSignInAvailable()).toBe(true);
      expect(getTestIdentity()).not.toBeNull();
    });
  });

  describe("createTestAwareActor identity injection", () => {
    // This is the seam that actually lets the test-only path reach the
    // authenticated backend: `useActor` builds an anonymous agent before the
    // wrapped factory runs, so the test identity must be applied to that agent
    // (or passed as `agentOptions.identity` when there is none). Without this
    // the tester reaches the workspace shell but every guarded call is
    // anonymous and traps.
    const uploadFile = vi.fn(async () => new Uint8Array());
    const downloadFile = vi.fn(async () => ({}) as never);

    beforeEach(() => {
      setFlag(true);
    });

    it("replaces the identity on the agent useActor already built", async () => {
      const agent = HttpAgent.createSync();
      const original = actorFactoryMock("test-actor");
      const wrapped = createTestAwareActor(original);

      const result = wrapped("canister-id", uploadFile, downloadFile, {
        agent,
      });

      expect(result).toBe("test-actor");
      expect(original).toHaveBeenCalledTimes(1);
      // The agent now signs as the deterministic test principal, not anonymous.
      const principal = await agent.getPrincipal();
      expect(principal.isAnonymous()).toBe(false);
      expect(principal.toText()).toBe(
        getTestIdentity()?.getPrincipal().toText(),
      );
    });

    it("passes the test identity through agentOptions when no agent is present", () => {
      const original = actorFactoryMock("test-actor");
      const wrapped = createTestAwareActor(original);

      wrapped("canister-id", uploadFile, downloadFile, {});

      expect(original).toHaveBeenCalledTimes(1);
      const options = original.mock.calls[0][3];
      expect(options.agentOptions?.identity).toBe(getTestIdentity());
    });

    it("delegates unchanged on a production host even when the flag is on", async () => {
      const originalHostname = window.location.hostname;
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, hostname: "my-app.caffeine.ai" },
      });
      try {
        const agent = HttpAgent.createSync();
        const original = actorFactoryMock("real-actor");
        const wrapped = createTestAwareActor(original);

        const result = wrapped("canister-id", uploadFile, downloadFile, {
          agent,
        });

        expect(result).toBe("real-actor");
        // The production agent is left anonymous; the test identity is never
        // injected on a production host.
        const principal = await agent.getPrincipal();
        expect(principal.isAnonymous()).toBe(true);
      } finally {
        Object.defineProperty(window, "location", {
          configurable: true,
          value: { ...window.location, hostname: originalHostname },
        });
      }
    });
  });
});
