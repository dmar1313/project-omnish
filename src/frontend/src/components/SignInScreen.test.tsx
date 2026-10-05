import { SignInScreen } from "@/components/SignInScreen";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const infra = vi.hoisted(() => ({
  login: vi.fn(),
  isInitializing: false,
  isLoggingIn: false,
  isLoginError: false,
  loginError: undefined as Error | undefined,
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useInternetIdentity: () => ({
    login: infra.login,
    isInitializing: infra.isInitializing,
    isLoggingIn: infra.isLoggingIn,
    isLoginError: infra.isLoginError,
    loginError: infra.loginError,
  }),
}));

function setTestSignInFlag(enabled: boolean) {
  if (enabled) {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = "true";
  } else {
    import.meta.env.VITE_ENABLE_TEST_SIGNIN = undefined;
  }
}

const originalHostname = window.location.hostname;

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

describe("SignInScreen", () => {
  beforeEach(() => {
    infra.login.mockReset();
    infra.isInitializing = false;
    infra.isLoggingIn = false;
    infra.isLoginError = false;
    infra.loginError = undefined;
    window.localStorage.clear();
    setTestSignInFlag(false);
  });

  afterEach(() => {
    setTestSignInFlag(false);
    window.localStorage.clear();
    setHostname(originalHostname);
  });

  it("renders the branded sign-in gate with a sign-in action", () => {
    render(<SignInScreen />);

    expect(
      screen.getByRole("heading", { name: /operator sign-in required/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in with internet identity/i }),
    ).toBeEnabled();
  });

  it("invokes login when the operator signs in", async () => {
    const user = userEvent.setup();
    render(<SignInScreen />);

    await user.click(
      screen.getByRole("button", { name: /sign in with internet identity/i }),
    );

    expect(infra.login).toHaveBeenCalledTimes(1);
  });

  it("disables the action and shows progress while logging in", () => {
    infra.isLoggingIn = true;
    render(<SignInScreen />);

    expect(
      screen.getByRole("button", { name: /opening internet identity/i }),
    ).toBeDisabled();
  });

  it("surfaces a login error message", () => {
    infra.isLoginError = true;
    infra.loginError = new Error("Identity provider unavailable");
    render(<SignInScreen />);

    expect(screen.getByTestId("auth.error_state")).toHaveTextContent(
      "Identity provider unavailable",
    );
  });

  // ---- Test-only sign-in path ----

  it("hides the test-only sign-in path when the flag is disabled", () => {
    render(<SignInScreen />);

    expect(
      screen.queryByTestId("auth.test_signin.section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("auth.test_signin_button"),
    ).not.toBeInTheDocument();
    // The real Internet Identity gate is unchanged.
    expect(
      screen.getByRole("button", { name: /sign in with internet identity/i }),
    ).toBeEnabled();
  });

  it("shows a clearly marked test-only path when the flag is enabled", () => {
    setTestSignInFlag(true);
    render(<SignInScreen />);

    const section = screen.getByTestId("auth.test_signin.section");
    expect(section).toHaveTextContent(/test-only sign-in/i);
    expect(section).toHaveTextContent(/must never be used by real operators/i);
    // The real sign-in action is still present and enabled.
    expect(
      screen.getByRole("button", { name: /sign in with internet identity/i }),
    ).toBeEnabled();
  });

  it("activates the test-only session when the test operator continues", async () => {
    const user = userEvent.setup();
    setTestSignInFlag(true);
    render(<SignInScreen />);

    await user.click(screen.getByTestId("auth.test_signin_button"));

    expect(window.localStorage.getItem("omnish.testSignIn")).toBe("true");
    // The real Internet Identity login is never invoked by the test path.
    expect(infra.login).not.toHaveBeenCalled();
  });

  it("hides the test-only path on a production host even when the flag is enabled", () => {
    // The build-time flag ships the path in the preview bundle, but a real user
    // on the production Caffeine domain must never see it. The component reads
    // the host-aware gate, not the raw build flag.
    setTestSignInFlag(true);
    setHostname("my-app.caffeine.ai");

    render(<SignInScreen />);

    expect(
      screen.queryByTestId("auth.test_signin.section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("auth.test_signin_button"),
    ).not.toBeInTheDocument();
    // The real Internet Identity gate is untouched.
    expect(
      screen.getByRole("button", { name: /sign in with internet identity/i }),
    ).toBeEnabled();
  });

  it("shows the test-only path on a canister preview host when the flag is enabled", () => {
    setTestSignInFlag(true);
    setHostname("4caro-hl777-77775-aaaba-cai.icp0.io");

    render(<SignInScreen />);

    expect(screen.getByTestId("auth.test_signin.section")).toBeInTheDocument();
    expect(screen.getByTestId("auth.test_signin_button")).toBeInTheDocument();
  });
});
