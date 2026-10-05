import { RunStatus } from "@/backend";
import CostsPage from "@/pages/CostsPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { screen } from "@testing-library/react";
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

describe("CostsPage", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    infra.actor = createMockActor({
      getCostTelemetry: vi.fn(async () => ({
        averageCostPerRun: 2100,
        totalRuns: 2n,
        totalTokenCostBurn: 4200,
      })),
      listRuns: vi.fn(async () => [
        {
          id: 1n,
          status: RunStatus.completed,
          tokenCostBurn: 1200,
          timestamp: 1_700_000_000_000_000_000n,
          characterId: 3n,
        },
        {
          id: 2n,
          status: RunStatus.completed,
          tokenCostBurn: 3000,
          timestamp: 1_700_000_100_000_000_000n,
          characterId: 3n,
        },
      ]),
    });
  });

  it("shows cumulative token burn and run totals", async () => {
    renderWithProviders(<CostsPage />);

    expect(
      await screen.findByRole("heading", { name: /cost & token tracker/i }),
    ).toBeInTheDocument();
    const burnCard = await screen.findByTestId("costs.summary.burn.card");
    expect(burnCard).toHaveTextContent("4.2K");
    expect(screen.getByTestId("costs.summary.runs.card")).toHaveTextContent(
      "2",
    );
  });

  it("lists each run in the per-run breakdown", async () => {
    renderWithProviders(<CostsPage />);

    expect(await screen.findByTestId("costs.table.row.1")).toBeInTheDocument();
    expect(screen.getByTestId("costs.table.row.2")).toBeInTheDocument();
    expect(screen.getByText("1,200.0")).toBeInTheDocument();
    expect(screen.getByText("3,000.0")).toBeInTheDocument();
  });

  it("shows an empty state when no runs are recorded", async () => {
    infra.actor = createMockActor({
      getCostTelemetry: vi.fn(async () => ({
        averageCostPerRun: 0,
        totalRuns: 0n,
        totalTokenCostBurn: 0,
      })),
      listRuns: vi.fn(async () => []),
    });

    renderWithProviders(<CostsPage />);

    expect(
      await screen.findByTestId("costs.table.empty_state"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("costs.trend.empty_state")).toBeInTheDocument();
  });
});
