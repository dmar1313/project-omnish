import { AgentKind, PatchStatus } from "@/backend";
import OptimizationPage from "@/pages/OptimizationPage";
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

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const pendingPatch = {
  id: 1n,
  status: PatchStatus.pending_approval,
  performanceDeltaMetrics: "+12% continuity",
  proposedPromptPatch: "Tighten the continuity guardrails.",
  versionTag: "writer-v3",
  createdAt: 1_700_000_000_000_000_000n,
  targetAgent: AgentKind.writer,
};

const approvedPatch = {
  ...pendingPatch,
  id: 2n,
  status: PatchStatus.approved,
  versionTag: "visual-v2",
  targetAgent: AgentKind.visual,
};

function adminActor(overrides = {}) {
  return createMockActor({
    getCallerUserRole: vi.fn(async () => "admin"),
    listSuperSuitPatches: vi.fn(async () => [pendingPatch, approvedPatch]),
    getEntropyState: vi.fn(async () => ({
      recentUpdateTimestamps: [1_700_000_000_000_000_000n],
      maxUpdatesPerHour: 3n,
    })),
    getAgentVersion: vi.fn(async (agent: AgentKind) => ({
      agent,
      currentVersion: `${agent}-v2`,
      history: [`${agent}-v1`, `${agent}-v2`],
    })),
    ...overrides,
  });
}

describe("OptimizationPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    infra.actor = adminActor();
  });

  it("restricts the gate to non-admin operators", async () => {
    infra.actor = createMockActor({
      getCallerUserRole: vi.fn(async () => "user"),
    });

    renderWithProviders(<OptimizationPage />);

    expect(
      await screen.findByRole("heading", { name: /access restricted/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approve patch/i }),
    ).not.toBeInTheDocument();
  });

  it("shows pending patches with approve and reject actions for an admin", async () => {
    renderWithProviders(<OptimizationPage />);

    expect(
      await screen.findByRole("heading", { name: /optimization gate/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /approve patch/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reject patch/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("writer-v3")).toBeInTheDocument();
  });

  it("approves a pending patch through the backend", async () => {
    const user = userEvent.setup();
    const approve = vi.fn(async () => ({
      ...pendingPatch,
      status: PatchStatus.approved,
    }));
    infra.actor = adminActor({ approveSuperSuitPatch: approve });

    renderWithProviders(<OptimizationPage />);

    await user.click(
      await screen.findByRole("button", { name: /approve patch/i }),
    );

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(1n);
    });
    expect(
      await screen.findByTestId("optimization.action.success_state"),
    ).toHaveTextContent(/approved writer-v3/i);
  });

  it("rejects a pending patch through the backend", async () => {
    const user = userEvent.setup();
    const reject = vi.fn(async () => ({
      ...pendingPatch,
      status: PatchStatus.rejected,
    }));
    infra.actor = adminActor({ rejectSuperSuitPatch: reject });

    renderWithProviders(<OptimizationPage />);

    await user.click(
      await screen.findByRole("button", { name: /reject patch/i }),
    );

    await waitFor(() => {
      expect(reject).toHaveBeenCalledWith(1n);
    });
    expect(
      await screen.findByTestId("optimization.action.success_state"),
    ).toHaveTextContent(/rejected writer-v3/i);
  });

  it("triggers a one-click rollback for an agent with history", async () => {
    const user = userEvent.setup();
    const rollback = vi.fn(async (agent: AgentKind) => ({
      agent,
      currentVersion: `${agent}-v1`,
      history: [`${agent}-v1`],
    }));
    infra.actor = adminActor({ rollbackAgentVersion: rollback });

    renderWithProviders(<OptimizationPage />);

    const writerPanel = await screen.findByTestId(
      "optimization.agent.panel.writer",
    );
    await user.click(
      within(writerPanel).getByRole("button", { name: /roll back/i }),
    );

    await waitFor(() => {
      expect(rollback).toHaveBeenCalledWith(AgentKind.writer);
    });
    expect(
      await screen.findByTestId("optimization.action.success_state"),
    ).toHaveTextContent(/rolled writer back to writer-v1/i);
  });

  it("shows the entropy ceiling state when the hourly budget is exhausted", async () => {
    infra.actor = adminActor({
      getEntropyState: vi.fn(async () => ({
        recentUpdateTimestamps: [
          1_700_000_000_000_000_000n,
          1_700_000_001_000_000_000n,
          1_700_000_002_000_000_000n,
        ],
        maxUpdatesPerHour: 3n,
      })),
    });

    renderWithProviders(<OptimizationPage />);

    expect(
      await screen.findByTestId("optimization.entropy.error_state"),
    ).toHaveTextContent(/entropy ceiling reached/i);
  });
});
