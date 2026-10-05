import type { LoreRule } from "@/backend";
import { LoreStatus } from "@/backend";
import LorePage from "@/pages/LorePage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const activeRule: LoreRule = {
  id: 1n,
  ruleName: "No FTL inside the Veil",
  timelineConstraints: "Applies after the Collapse.",
  universeBounds: "The Veil nebula only.",
  status: LoreStatus.active,
  createdAt: 1_700_000_000_000_000_000n,
};

const deprecatedRule: LoreRule = {
  ...activeRule,
  id: 2n,
  ruleName: "Old Accord",
  status: LoreStatus.deprecated,
};

describe("LorePage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    infra.actor = createMockActor({
      listLore: vi.fn(async () => [activeRule, deprecatedRule]),
    });
  });

  it("lists lore rules with their constraints", async () => {
    renderWithProviders(<LorePage />);

    expect(
      await screen.findByRole("heading", { name: /world lore/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No FTL inside the Veil"),
    ).toBeInTheDocument();
    expect(screen.getByText("Old Accord")).toBeInTheDocument();
    expect(
      screen.getAllByText("Applies after the Collapse.").length,
    ).toBeGreaterThan(0);
  });

  it("filters rules by status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LorePage />);

    await screen.findByText("No FTL inside the Veil");
    await user.click(screen.getByTestId("lore.filter.deprecated.tab"));

    expect(screen.getByText("Old Accord")).toBeInTheDocument();
    expect(
      screen.queryByText("No FTL inside the Veil"),
    ).not.toBeInTheDocument();
  });

  it("creates a lore rule through the backend", async () => {
    const user = userEvent.setup();
    const createLore = vi.fn(async () => activeRule);
    infra.actor = createMockActor({
      listLore: vi.fn(async () => []),
      createLore,
    });

    renderWithProviders(<LorePage />);

    await user.click(await screen.findByTestId("lore.create_button"));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByTestId("lore.name.input"),
      "No FTL inside the Veil",
    );
    await user.type(
      within(dialog).getByTestId("lore.timeline.textarea"),
      "Applies after the Collapse.",
    );
    await user.type(
      within(dialog).getByTestId("lore.bounds.textarea"),
      "The Veil nebula only.",
    );
    await user.click(within(dialog).getByTestId("lore.submit_button"));

    await waitFor(() => {
      expect(createLore).toHaveBeenCalledWith({
        ruleName: "No FTL inside the Veil",
        timelineConstraints: "Applies after the Collapse.",
        universeBounds: "The Veil nebula only.",
      });
    });
  });

  it("requires all fields before creating", async () => {
    const user = userEvent.setup();
    const createLore = vi.fn(async () => activeRule);
    infra.actor = createMockActor({
      listLore: vi.fn(async () => []),
      createLore,
    });

    renderWithProviders(<LorePage />);

    await user.click(await screen.findByTestId("lore.create_button"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("lore.submit_button"));

    expect(createLore).not.toHaveBeenCalled();
    expect(
      within(dialog).getByTestId("lore.name.error_state"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("lore.timeline.error_state"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("lore.bounds.error_state"),
    ).toBeInTheDocument();
  });

  it("deprecates an active rule", async () => {
    const user = userEvent.setup();
    const setLoreStatus = vi.fn(async () => true);
    infra.actor = createMockActor({
      listLore: vi.fn(async () => [activeRule]),
      setLoreStatus,
    });

    renderWithProviders(<LorePage />);

    await user.click(await screen.findByTestId("lore.status_toggle.1"));

    await waitFor(() => {
      expect(setLoreStatus).toHaveBeenCalledWith(1n, LoreStatus.deprecated);
    });
  });
});
