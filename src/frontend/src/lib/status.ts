import {
  AgentKind,
  AssetKind,
  LoreStatus,
  PatchStatus,
  RunDecision,
  RunStatus,
  SimulationStep,
  UserRole,
  VideoOutputStatus,
} from "@/backend";

export type StatusTone =
  | "queued"
  | "running"
  | "completed"
  | "halted"
  | "pending"
  | "approved"
  | "rejected";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const RUN_STATUS_META: Record<RunStatus, StatusMeta> = {
  [RunStatus.pending]: { label: "Queued", tone: "queued" },
  [RunStatus.running]: { label: "Running", tone: "running" },
  [RunStatus.completed]: { label: "Completed", tone: "completed" },
  [RunStatus.halted]: { label: "Halted", tone: "halted" },
  [RunStatus.failed]: { label: "Failed", tone: "halted" },
};

const RUN_DECISION_META: Record<RunDecision, StatusMeta> = {
  [RunDecision.in_progress]: { label: "In Progress", tone: "running" },
  [RunDecision.completed]: { label: "Completed", tone: "completed" },
  [RunDecision.approved]: { label: "Approved", tone: "approved" },
  [RunDecision.rejected]: { label: "Rejected", tone: "rejected" },
};

const PATCH_STATUS_META: Record<PatchStatus, StatusMeta> = {
  [PatchStatus.pending_approval]: { label: "Pending", tone: "pending" },
  [PatchStatus.approved]: { label: "Approved", tone: "approved" },
  [PatchStatus.rejected]: { label: "Rejected", tone: "rejected" },
};

const LORE_STATUS_META: Record<LoreStatus, StatusMeta> = {
  [LoreStatus.active]: { label: "Active", tone: "completed" },
  [LoreStatus.deprecated]: { label: "Deprecated", tone: "queued" },
};

const AGENT_LABEL: Record<AgentKind, string> = {
  [AgentKind.writer]: "Writer",
  [AgentKind.continuity]: "Continuity",
  [AgentKind.visual]: "Visual",
};

const ASSET_LABEL: Record<AssetKind, string> = {
  [AssetKind.image]: "Image",
  [AssetKind.video]: "Video",
  [AssetKind.audio]: "Audio",
};

const STEP_LABEL: Record<SimulationStep, string> = {
  [SimulationStep.ingestion]: "Ingestion",
  [SimulationStep.dna_crossref]: "DNA Crossref",
  [SimulationStep.lore_check]: "Lore Check",
  [SimulationStep.asset_binding]: "Asset Binding",
  [SimulationStep.fracture]: "Fracture",
};

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.admin]: "Admin",
  [UserRole.user]: "Operator",
  [UserRole.guest]: "Guest",
};

const VIDEO_STATUS_META: Record<VideoOutputStatus, StatusMeta> = {
  [VideoOutputStatus.generating]: { label: "Generating", tone: "running" },
  [VideoOutputStatus.ready]: { label: "Ready", tone: "completed" },
  [VideoOutputStatus.no_result]: { label: "No result", tone: "queued" },
};

export function runStatusMeta(status: RunStatus): StatusMeta {
  return RUN_STATUS_META[status] ?? { label: String(status), tone: "queued" };
}

export function runDecisionMeta(decision: RunDecision): StatusMeta {
  return (
    RUN_DECISION_META[decision] ?? { label: String(decision), tone: "queued" }
  );
}

export function patchStatusMeta(status: PatchStatus): StatusMeta {
  return (
    PATCH_STATUS_META[status] ?? { label: String(status), tone: "pending" }
  );
}

export function loreStatusMeta(status: LoreStatus): StatusMeta {
  return LORE_STATUS_META[status] ?? { label: String(status), tone: "queued" };
}

export function agentLabel(agent: AgentKind): string {
  return AGENT_LABEL[agent] ?? String(agent);
}

export function assetKindLabel(kind: AssetKind): string {
  return ASSET_LABEL[kind] ?? String(kind);
}

export function simulationStepLabel(step: SimulationStep): string {
  return STEP_LABEL[step] ?? String(step);
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABEL[role] ?? String(role);
}

export function videoStatusMeta(status: VideoOutputStatus): StatusMeta {
  return VIDEO_STATUS_META[status] ?? { label: String(status), tone: "queued" };
}

/**
 * True while a run's video output is still being produced. A run is generating
 * while its status is pending/running, or while the backend reports the video
 * output as #generating (e.g. a revision is being regenerated). The final
 * no-result state must never be shown during this window.
 */
export function isVideoGenerating(
  status: RunStatus,
  videoStatus: VideoOutputStatus | null | undefined,
): boolean {
  if (isActiveRun(status)) return true;
  return videoStatus === VideoOutputStatus.generating;
}

export function isActiveRun(status: RunStatus): boolean {
  return status === RunStatus.running || status === RunStatus.pending;
}

/** The four stages of the prompt-to-videos pipeline. */
export type FlowStage = "prompt" | "simulation" | "review" | "videos";

/**
 * The stage a run is currently at, derived from its status and decision.
 * Active runs are mid-simulation; a completed, undecided run is awaiting
 * review; a decided run has moved on to its generated videos.
 */
export function runFlowStage(
  status: RunStatus,
  decision: RunDecision | null | undefined,
): FlowStage {
  if (isActiveRun(status)) return "simulation";
  if (isDecidedDecision(decision)) return "videos";
  if (status === RunStatus.completed) return "review";
  // Halted/failed runs stay on the simulation stage with a recovery action.
  return "simulation";
}

/** Stages already reached for a run, used to gate stepper jumps. */
export function reachedFlowStages(
  status: RunStatus,
  decision: RunDecision | null | undefined,
): FlowStage[] {
  const stages: FlowStage[] = ["prompt", "simulation"];
  if (status === RunStatus.completed || isDecidedDecision(decision)) {
    stages.push("review");
  }
  if (status === RunStatus.completed || isDecidedDecision(decision)) {
    stages.push("videos");
  }
  return stages;
}

/**
 * Only an explicit approve/reject retires a run's proceed controls. A freshly
 * completed run is seeded with a #completed decision, which is NOT decided.
 * Acts as a type guard so callers can safely read the decision afterwards.
 */
export function isDecidedDecision(
  decision: RunDecision | null | undefined,
): decision is RunDecision.approved | RunDecision.rejected {
  return decision === RunDecision.approved || decision === RunDecision.rejected;
}

/** Motoko Time.now() is a nanosecond bigint. */
export function timestampToDate(timestamp: bigint): Date | null {
  const date = new Date(Number(timestamp / 1_000_000n));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(timestamp: bigint): string {
  const date = timestampToDate(timestamp);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelative(timestamp: bigint): string {
  const date = timestampToDate(timestamp);
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
