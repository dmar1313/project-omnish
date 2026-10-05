import App from "@/App";
import { createMockActor, createTestQueryClient } from "@/test/helpers";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const infra = vi.hoisted(() => ({
  isAuthenticated: false,
  isInitializing: false,
  role: "guest" as string,
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

describe("App authentication gate", () => {
  beforeEach(() => {
    infra.isAuthenticated = false;
    infra.isInitializing = false;
    infra.role = "guest";
    infra.actor = createMockActor();
    window.localStorage.clear();
    setTestSignInFlag(false);
  });

  afterEach(() => {
    setTestSignInFlag(false);
    window.localStorage.clear();
  });

  it("shows the sign-in screen to unauthenticated visitors", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: /operator sign-in required/i,
      }),
    ).toBeInTheDocument();
    // No workspace navigation is reachable while signed out.
    expect(
      screen.queryByRole("navigation", { name: /primary/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a loading state while the session initializes", () => {
    infra.isInitializing = true;
    renderApp();

    expect(screen.getByTestId("app.loading_state")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /operator sign-in required/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the workspace shell for a signed-in operator", async () => {
    infra.isAuthenticated = true;
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
    });

    renderApp();

    expect(
      await screen.findByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /live production feed/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /simulation inspector/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /cost & token tracker/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /dna registry/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /world lore/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /assets/i })).toBeInTheDocument();
  });

  it("renders the default route's feed content for a signed-in operator", async () => {
    // The default route must not be a blank screen: a signed-in operator lands
    // on the Live Production Feed with its composer and run list mounted.
    infra.isAuthenticated = true;
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
    });

    renderApp();

    expect(await screen.findByTestId("feed.page")).toBeInTheDocument();
    expect(screen.getByTestId("feed.prompt.panel")).toBeInTheDocument();
    expect(screen.getByTestId("feed.runs.panel")).toBeInTheDocument();
  });

  it("hides the admin-only Optimization Gate from a non-admin operator", async () => {
    infra.isAuthenticated = true;
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
    });

    renderApp();

    // The primary navigation renders for the signed-in operator...
    expect(
      await screen.findByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    // ...but admin-only destinations are not offered to a non-admin.
    expect(
      screen.queryByRole("link", { name: /optimization gate/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /video settings/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the admin-only Optimization Gate to an admin operator", async () => {
    infra.isAuthenticated = true;
    infra.role = "admin";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "admin"),
    });

    renderApp();

    const optimizationLink = await screen.findByRole("link", {
      name: /optimization gate/i,
    });
    expect(optimizationLink).toHaveTextContent(/admin/i);
  });

  it("resolves the admin role from the backend for the signed-in caller", async () => {
    infra.isAuthenticated = true;
    infra.role = "admin";
    const actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "admin"),
    });
    infra.actor = actor;

    renderApp();

    await waitFor(() => {
      expect(actor.getCallerUserRole).toHaveBeenCalled();
    });
  });

  // ---- Test-only sign-in path ----

  it("keeps the real sign-in gate when the test-only flag is disabled", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: /operator sign-in required/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("auth.test_signin.section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: /primary/i }),
    ).not.toBeInTheDocument();
  });

  it("reaches the authenticated workspace after test-only sign-in", async () => {
    const user = userEvent.setup();
    setTestSignInFlag(true);
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
      listRunDecisions: vi.fn(async () => []),
    });

    renderApp();

    // The tester activates the clearly marked test path from the gate.
    await user.click(await screen.findByTestId("auth.test_signin_button"));

    // The authenticated workspace shell renders, with the videos and
    // simulation routes reachable from the primary navigation.
    expect(
      await screen.findByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /generated videos/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /simulation inspector/i }),
    ).toBeInTheDocument();
  });

  it("renders the videos route for a test-signed-in operator", async () => {
    const user = userEvent.setup();
    setTestSignInFlag(true);
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
      listRunDecisions: vi.fn(async () => []),
    });

    renderApp();
    await user.click(await screen.findByTestId("auth.test_signin_button"));
    await user.click(
      await screen.findByRole("link", { name: /generated videos/i }),
    );

    // The videos route renders its authenticated content (the capability
    // notice and the no-run empty state), not a blank screen.
    expect(await screen.findByTestId("videos.page")).toBeInTheDocument();
    expect(screen.getByTestId("videos.capability_notice")).toBeInTheDocument();
    expect(screen.getByTestId("videos.empty_state")).toBeInTheDocument();
  });

  it("returns to the real sign-in gate when a test operator signs out", async () => {
    const user = userEvent.setup();
    setTestSignInFlag(true);
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
      listRunDecisions: vi.fn(async () => []),
    });

    renderApp();
    await user.click(await screen.findByTestId("auth.test_signin_button"));
    await screen.findByRole("navigation", { name: /primary/i });

    await user.click(screen.getByTestId("auth.open_modal_button"));
    await user.click(await screen.findByTestId("auth.sign_out_button"));

    // The persisted test activation is cleared, so the real gate returns.
    expect(window.localStorage.getItem("omnish.testSignIn")).toBeNull();
    expect(
      await screen.findByRole("heading", {
        name: /operator sign-in required/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the simulation route for a test-signed-in operator", async () => {
    const user = userEvent.setup();
    setTestSignInFlag(true);
    infra.role = "user";
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
      listDna: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
      listRunDecisions: vi.fn(async () => []),
      listSimulationLogs: vi.fn(async () => []),
      listAssets: vi.fn(async () => []),
    });

    renderApp();
    await user.click(await screen.findByTestId("auth.test_signin_button"));
    await user.click(
      await screen.findByRole("link", { name: /simulation inspector/i }),
    );

    expect(await screen.findByTestId("simulation.page")).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation.run_list.empty_state"),
    ).toBeInTheDocument();
  });
});
