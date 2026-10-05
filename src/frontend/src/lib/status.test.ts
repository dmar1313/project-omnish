import {
  AgentKind,
  AssetKind,
  LoreStatus,
  PatchStatus,
  RunDecision,
  RunStatus,
  SimulationStep,
  UserRole,
} from "@/backend";
import {
  agentLabel,
  assetKindLabel,
  formatCompact,
  formatNumber,
  isActiveRun,
  isDecidedDecision,
  loreStatusMeta,
  patchStatusMeta,
  reachedFlowStages,
  roleLabel,
  runFlowStage,
  runStatusMeta,
  simulationStepLabel,
  timestampToDate,
} from "@/lib/status";
import { describe, expect, it } from "vitest";

describe("status metadata", () => {
  it("maps every run status to a human label and tone", () => {
    expect(runStatusMeta(RunStatus.pending)).toEqual({
      label: "Queued",
      tone: "queued",
    });
    expect(runStatusMeta(RunStatus.running)).toEqual({
      label: "Running",
      tone: "running",
    });
    expect(runStatusMeta(RunStatus.completed)).toEqual({
      label: "Completed",
      tone: "completed",
    });
    expect(runStatusMeta(RunStatus.halted)).toEqual({
      label: "Halted",
      tone: "halted",
    });
    expect(runStatusMeta(RunStatus.failed)).toEqual({
      label: "Failed",
      tone: "halted",
    });
  });

  it("maps patch, lore, agent, asset, step, and role labels", () => {
    expect(patchStatusMeta(PatchStatus.pending_approval).label).toBe("Pending");
    expect(patchStatusMeta(PatchStatus.approved).label).toBe("Approved");
    expect(patchStatusMeta(PatchStatus.rejected).label).toBe("Rejected");
    expect(loreStatusMeta(LoreStatus.active).label).toBe("Active");
    expect(loreStatusMeta(LoreStatus.deprecated).label).toBe("Deprecated");
    expect(agentLabel(AgentKind.writer)).toBe("Writer");
    expect(agentLabel(AgentKind.visual)).toBe("Visual");
    expect(agentLabel(AgentKind.continuity)).toBe("Continuity");
    expect(assetKindLabel(AssetKind.image)).toBe("Image");
    expect(assetKindLabel(AssetKind.video)).toBe("Video");
    expect(assetKindLabel(AssetKind.audio)).toBe("Audio");
    expect(simulationStepLabel(SimulationStep.ingestion)).toBe("Ingestion");
    expect(simulationStepLabel(SimulationStep.lore_check)).toBe("Lore Check");
    expect(roleLabel(UserRole.admin)).toBe("Admin");
    expect(roleLabel(UserRole.user)).toBe("Operator");
    expect(roleLabel(UserRole.guest)).toBe("Guest");
  });

  it("treats only running and pending runs as active", () => {
    expect(isActiveRun(RunStatus.running)).toBe(true);
    expect(isActiveRun(RunStatus.pending)).toBe(true);
    expect(isActiveRun(RunStatus.completed)).toBe(false);
    expect(isActiveRun(RunStatus.halted)).toBe(false);
    expect(isActiveRun(RunStatus.failed)).toBe(false);
  });

  it("converts nanosecond timestamps to dates", () => {
    const date = timestampToDate(1_700_000_000_000_000_000n);
    expect(date).not.toBeNull();
    expect(date?.getTime()).toBe(1_700_000_000_000);
  });

  it("formats numbers and compacts large values", () => {
    expect(formatNumber(1234.567, 1)).toBe("1,234.6");
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatCompact(1500)).toBe("1.5K");
    expect(formatCompact(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("pipeline flow stage", () => {
  it("places an active run on the simulation stage", () => {
    expect(runFlowStage(RunStatus.running, RunDecision.in_progress)).toBe(
      "simulation",
    );
    expect(runFlowStage(RunStatus.pending, null)).toBe("simulation");
  });

  it("places a completed, undecided run on the review stage", () => {
    expect(runFlowStage(RunStatus.completed, RunDecision.completed)).toBe(
      "review",
    );
    expect(runFlowStage(RunStatus.completed, null)).toBe("review");
  });

  it("places a decided run on the generated videos stage", () => {
    expect(runFlowStage(RunStatus.completed, RunDecision.approved)).toBe(
      "videos",
    );
    expect(runFlowStage(RunStatus.halted, RunDecision.rejected)).toBe("videos");
  });

  it("keeps halted and failed runs on the simulation stage for recovery", () => {
    expect(runFlowStage(RunStatus.halted, RunDecision.completed)).toBe(
      "simulation",
    );
    expect(runFlowStage(RunStatus.failed, null)).toBe("simulation");
  });

  it("reaches review and videos only once a run completes", () => {
    expect(
      reachedFlowStages(RunStatus.running, RunDecision.in_progress),
    ).toEqual(["prompt", "simulation"]);
    expect(
      reachedFlowStages(RunStatus.completed, RunDecision.completed),
    ).toEqual(["prompt", "simulation", "review", "videos"]);
    expect(reachedFlowStages(RunStatus.halted, RunDecision.completed)).toEqual([
      "prompt",
      "simulation",
    ]);
  });

  it("treats only explicit approve/reject as decided", () => {
    expect(isDecidedDecision(RunDecision.approved)).toBe(true);
    expect(isDecidedDecision(RunDecision.rejected)).toBe(true);
    expect(isDecidedDecision(RunDecision.completed)).toBe(false);
    expect(isDecidedDecision(RunDecision.in_progress)).toBe(false);
    expect(isDecidedDecision(null)).toBe(false);
    expect(isDecidedDecision(undefined)).toBe(false);
  });
});
