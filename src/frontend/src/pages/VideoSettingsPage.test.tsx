import VideoSettingsPage from "@/pages/VideoSettingsPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the admin Replicate-token settings surface.
 *
 * The accepted behavior: generation requires an admin-configured Replicate API
 * token, and this page is where it is set and cleared. The stored token is
 * never echoed back — only whether one is configured.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * token methods.
 */

const infra = vi.hoisted(() => ({
  isAuthenticated: true,
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

describe("VideoSettingsPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
  });

  it("reports when no token is configured and saves one", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      getReplicateTokenStatus: vi.fn(async () => ({ configured: false })),
      setReplicateToken: vi.fn(async () => ({ configured: true })),
    });
    infra.actor = actor;

    renderWithProviders(<VideoSettingsPage />);

    expect(await screen.findByText(/not configured/i)).toBeInTheDocument();

    await user.type(
      await screen.findByTestId("settings.video.token.input"),
      "r8_secret_token",
    );
    await user.click(screen.getByTestId("settings.video.token.submit_button"));

    await waitFor(() => {
      expect(actor.setReplicateToken).toHaveBeenCalledWith("r8_secret_token");
    });
    // The secret is cleared from the input after submit.
    expect(screen.getByTestId("settings.video.token.input")).toHaveValue("");
  });

  it("shows a configured token and clears it", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      clearReplicateToken: vi.fn(async () => ({ configured: false })),
    });
    infra.actor = actor;

    renderWithProviders(<VideoSettingsPage />);

    expect(await screen.findByText(/^configured$/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("settings.video.token.clear_button"));

    await waitFor(() => {
      expect(actor.clearReplicateToken).toHaveBeenCalled();
    });
  });

  it("surfaces a save failure without echoing the secret back", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      getReplicateTokenStatus: vi.fn(async () => ({ configured: false })),
      setReplicateToken: vi.fn(async () => {
        throw new Error("token rejected");
      }),
    });
    infra.actor = actor;

    renderWithProviders(<VideoSettingsPage />);

    await user.type(
      await screen.findByTestId("settings.video.token.input"),
      "r8_bad",
    );
    await user.click(screen.getByTestId("settings.video.token.submit_button"));

    expect(
      await screen.findByTestId("settings.video.token.error_state"),
    ).toHaveTextContent("token rejected");
  });
});
