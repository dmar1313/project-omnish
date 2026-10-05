import App from "@/App";
import { createMockActor, createTestQueryClient } from "@/test/helpers";
import {
  JourneyStepError,
  captureAppResponse,
  findStepElement,
  runJourney,
} from "@/test/journey";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Diagnostic cover for the authenticated journey reached through the test-only
 * sign-in path.
 *
 * The accepted requirement: when the automated test cannot complete, its output
 * must name the exact step that stopped, the error, and the app response
 * observed at that point — and it must never report success when it did not
 * actually exercise the flow.
 *
 * This suite drives the real `App` shell (real router, real sign-in gate, real
 * workspace layout) with a typed local actor mock, activating the test-only
 * sign-in path exactly as a tester would. Each step is named and wrapped by the
 * diagnostic harness, so a failure reports step + error + observed response
 * instead of a generic "could not be completed".
 *
 * The backend actor is a local typed mock, so this proves the frontend journey
 * and consumer contract, not the real canister. The PocketIC lane covers the
 * real backend methods.
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
  InternetIdentityProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

function renderApp() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function setTestSignInFlag(enabled: boolean) {
  if (enabled) {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = "true";
  } else {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = undefined;
  }
}

describe("authenticated journey diagnostics", () => {
  beforeEach(() => {
    infra.isAuthenticated = false;
    infra.isInitializing = false;
    infra.actor = createMockActor({
      _initialize_access_control: vi.fn(async () => undefined),
      getCallerUserRole: vi.fn(async () => "user"),
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
      listRunDecisions: vi.fn(async () => []),
    });
    window.localStorage.clear();
    setTestSignInFlag(true);
  });

  afterEach(() => {
    setTestSignInFlag(false);
    window.localStorage.clear();
  });

  it("reaches the authenticated workspace through the test-only sign-in path, step by step", async () => {
    const user = userEvent.setup();
    const actor = infra.actor as ReturnType<typeof createMockActor>;

    renderApp();

    await runJourney([
      {
        name: "render the sign-in gate for an unauthenticated visitor",
        run: async () => {
          await findStepElement(
            "render the sign-in gate for an unauthenticated visitor",
            "auth.test_signin.section",
          );
        },
      },
      {
        name: "activate the test-only sign-in path",
        run: async () => {
          const button = await findStepElement(
            "activate the test-only sign-in path",
            "auth.test_signin_button",
          );
          await user.click(button);
        },
      },
      {
        name: "render the authenticated workspace shell",
        run: async () => {
          await findStepElement(
            "render the authenticated workspace shell",
            "nav.home.link",
          );
        },
      },
      {
        name: "register the deterministic test principal with the backend",
        run: async () => {
          // The test identity is a real Ed25519 principal the backend has never
          // seen, so the registration seam must run before any guarded call.
          await vi.waitFor(() => {
            expect(actor._initialize_access_control).toHaveBeenCalled();
          });
        },
      },
      {
        name: "reach the Generated Videos authenticated surface",
        run: async () => {
          const videosLink = await screen.findByRole("link", {
            name: /generated videos/i,
          });
          await user.click(videosLink);
          await findStepElement(
            "reach the Generated Videos authenticated surface",
            "videos.page",
          );
        },
      },
    ]);
  });

  it("reports the exact step, error, and app response when a step cannot complete", async () => {
    // This proves the harness itself is diagnostic: a step that cannot find its
    // surface must fail with the step name, the error, and the observed app
    // response — never a silent pass or a generic "could not be completed".
    renderApp();

    let caught: unknown;
    try {
      await runJourney([
        {
          name: "render the sign-in gate",
          run: async () => {
            await findStepElement(
              "render the sign-in gate",
              "auth.test_signin.section",
            );
          },
        },
        {
          name: "reach a surface that does not exist",
          run: async () => {
            await findStepElement(
              "reach a surface that does not exist",
              "does.not.exist",
              100,
            );
          },
        },
      ]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(JourneyStepError);
    const failure = caught as JourneyStepError;
    // The report names the exact step that stopped...
    expect(failure.message).toContain(
      'step 2/2: "reach a surface that does not exist"',
    );
    // ...the error...
    expect(failure.message).toContain("could not find element");
    // ...and the app response observed at that point.
    expect(failure.message).toContain("App response observed at that point:");
    expect(failure.appResponse).toContain("Operator sign-in required");
  });

  it("fails explicitly rather than passing when a journey runs no steps", async () => {
    await expect(runJourney([])).rejects.toThrow(
      /no steps were provided, so nothing was exercised/i,
    );
  });

  it("captures a readable app response even when the DOM has no visible text", () => {
    const response = captureAppResponse();
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);
  });
});
