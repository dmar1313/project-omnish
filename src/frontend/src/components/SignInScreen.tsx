import { Button } from "@/components/ui/button";
import { activateTestSignIn, isTestSignInAvailable } from "@/lib/testIdentity";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { Activity, FlaskConical, Loader2, ShieldCheck } from "lucide-react";

/**
 * Branded gate shown to unauthenticated visitors. The whole workspace is
 * behind sign-in, so this is the only surface an anonymous user can reach.
 *
 * A clearly marked test-only path lets a tester reach the authenticated
 * workspace without a real Internet Identity credential. It is gated behind
 * `VITE_ENABLE_TEST_SIGNIN` and a non-production host check so it never appears
 * to real users on the live app, and it never weakens the real Internet
 * Identity flow.
 */
export function SignInScreen() {
  const { login, isInitializing, isLoggingIn, isLoginError, loginError } =
    useInternetIdentity();
  const disabled = isInitializing || isLoggingIn;
  // The test-only path is shown only when the build enabled it AND the page is
  // not served from a production host, so real users never see it.
  const testSignInEnabled = isTestSignInAvailable();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden="true"
        className="grid-mesh pointer-events-none absolute inset-0 opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <Activity className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold tracking-tight text-foreground">
              Project Omnish
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Creative Ops Control Room
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-elevated">
          <div className="mb-6 space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Operator sign-in required
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Authenticate with Internet Identity to access the production feed,
              simulation inspector, and optimization gate.
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            className="w-full rounded-md font-medium"
            onClick={() => login()}
            disabled={disabled}
            data-ocid="auth.sign_in_button"
          >
            {disabled ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {isInitializing
              ? "Initializing…"
              : isLoggingIn
                ? "Opening Internet Identity…"
                : "Sign in with Internet Identity"}
          </Button>

          {isLoginError ? (
            <p
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              data-ocid="auth.error_state"
            >
              {loginError?.message ?? "Sign-in failed. Please try again."}
            </p>
          ) : null}

          {testSignInEnabled ? (
            <div
              className="mt-6 rounded-md border border-dashed border-status-halted/50 bg-status-halted/10 p-3"
              data-ocid="auth.test_signin.section"
            >
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-status-halted">
                <FlaskConical className="size-3.5" aria-hidden="true" />
                Test-only sign-in
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                For automated testing only. This bypasses Internet Identity and
                must never be used by real operators.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-md border-status-halted/50 font-mono text-[11px] uppercase tracking-wider text-status-halted hover:bg-status-halted/10"
                onClick={() => activateTestSignIn()}
                disabled={disabled}
                data-ocid="auth.test_signin_button"
              >
                Continue as test operator
              </Button>
            </div>
          ) : null}

          <p className="mt-6 border-t border-border pt-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
            Access is role-scoped. The first authenticated operator is granted
            admin privileges.
          </p>
        </div>
      </div>
    </div>
  );
}
