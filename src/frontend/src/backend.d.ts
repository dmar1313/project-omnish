import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface AgentOutput {
    content: string;
    agent: AgentKind;
}
export interface AgentVersion {
    agent: AgentKind;
    history: Array<VersionTag>;
    currentVersion: VersionTag;
}
export interface AssetIngredient {
    id: Id;
    linkedCharacterId?: Id;
    createdAt: Timestamp;
    tags: Array<string>;
    fileName: string;
    fileType: AssetKind;
    storageUrl: string;
}
export interface AssetInput {
    linkedCharacterId?: Id;
    tags: Array<string>;
    fileName: string;
    fileType: AssetKind;
    storageUrl: string;
}
export interface AttachMediaInput {
    mimeType: string;
    durationSeconds: number;
    storageUrl: string;
    cameoId?: Id;
    runId: Id;
    aspectRatio: string;
}
export interface CameoCapture {
    id: Id;
    status: CameoStatus;
    rightAssetId?: Id;
    voiceAssetId?: Id;
    leftAssetId?: Id;
    createdAt: Timestamp;
    frontAssetId?: Id;
    characterId: Id;
}
export interface CameoInput {
    rightAssetId?: Id;
    voiceAssetId?: Id;
    leftAssetId?: Id;
    frontAssetId?: Id;
    characterId: Id;
}
export interface Cell {
    value: Value;
    name: string;
}
export interface CostTelemetry {
    averageCostPerRun: number;
    totalRuns: bigint;
    totalTokenCostBurn: number;
}
export interface DnaInput {
    visualMarkers: string;
    characterName: string;
    identityBlocks: string;
    immutableTraits: string;
}
export interface DnaRecord {
    id: Id;
    visualMarkers: string;
    activeVersion: bigint;
    characterName: string;
    createdAt: Timestamp;
    identityBlocks: string;
    immutableTraits: string;
}
export interface EntropyState {
    recentUpdateTimestamps: Array<Timestamp>;
    maxUpdatesPerHour: bigint;
}
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface FormatAdapterOutput {
    content: string;
    characterLimit: bigint;
    platform: string;
    aspectRatio: string;
}
export interface HttpHeader {
    value: string;
    name: string;
}
export interface HttpRequestResult {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export type Id = bigint;
export interface LoreInput {
    ruleName: string;
    timelineConstraints: string;
    universeBounds: string;
}
export interface LoreRule {
    id: Id;
    ruleName: string;
    status: LoreStatus;
    createdAt: Timestamp;
    timelineConstraints: string;
    universeBounds: string;
}
export interface MediaArtifact {
    status: MediaArtifactStatus;
    createdAt: Timestamp;
    mimeType: string;
    durationSeconds: number;
    storageUrl: string;
    characterId?: Id;
    cameoId?: Id;
    aspectRatio: string;
}
export interface ProductionRun {
    id: Id;
    status: RunStatus;
    formatOutputs: Array<FormatAdapterOutput>;
    rawInput: string;
    tokenCostBurn: number;
    videoStatus: VideoOutputStatus;
    timestamp: Timestamp;
    characterId?: Id;
    generatedAssets: Array<AgentOutput>;
    mediaArtifact?: MediaArtifact;
    promptId?: Id;
}
export interface ReplicateTokenStatus {
    configured: boolean;
}
export interface RerunVideoGenerationInput {
    promptIndex?: bigint;
    modelId?: string;
    runId: Id;
}
export interface Result {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export type Result__1 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export interface Revision {
    formatOutputs: Array<FormatAdapterOutput>;
    tokenCostBurn: number;
    timestamp: Timestamp;
    instruction?: string;
    revisionNumber: bigint;
    generatedAssets: Array<AgentOutput>;
}
export interface RunDecisionState {
    decision: RunDecision;
    rejectionReason?: string;
    acceptedRevision?: bigint;
}
export interface RunInput {
    rawInput: string;
    assetIngredientIds: Array<Id>;
    characterId?: Id;
}
export interface RunSummary {
    id: Id;
    status: RunStatus;
    tokenCostBurn: number;
    timestamp: Timestamp;
    characterId?: Id;
}
export interface SimulationLog {
    id: Id;
    rawInput: string;
    stepName: SimulationStep;
    timestamp: Timestamp;
    evaluationOutput: string;
    runId: Id;
}
export interface StartVideoGenerationInput {
    promptIndex?: bigint;
    modelId?: string;
    runId: Id;
}
export interface SuperSuitPatch {
    id: Id;
    status: PatchStatus;
    performanceDeltaMetrics: string;
    proposedPromptPatch: string;
    versionTag: VersionTag;
    createdAt: Timestamp;
    targetAgent: AgentKind;
}
export type Timestamp = bigint;
export interface TransformationInput {
    context: Uint8Array;
    response: HttpRequestResult;
}
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export interface TweakInput {
    instruction: string;
    runId: Id;
}
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export type VersionTag = string;
export interface VideoGeneration {
    status: VideoGenerationStatus;
    startedAt: Timestamp;
    predictionId?: string;
    error?: string;
    prompt: string;
    promptIndex: bigint;
    finishedAt?: Timestamp;
    modelId: string;
    runId: Id;
}
export interface VideoModel {
    id: string;
    provider: string;
    premium: boolean;
    name: string;
    default: boolean;
}
export interface VideoPromptOption {
    content: string;
    agent: string;
    index: bigint;
}
export enum AgentKind {
    writer = "writer",
    continuity = "continuity",
    visual = "visual"
}
export enum AssetKind {
    audio = "audio",
    video = "video",
    image = "image"
}
export enum CameoStatus {
    complete = "complete",
    draft = "draft"
}
export enum LoreStatus {
    active = "active",
    deprecated = "deprecated"
}
export enum MediaArtifactStatus {
    generating = "generating",
    ready = "ready",
    failed = "failed"
}
export enum PatchStatus {
    pending_approval = "pending_approval",
    approved = "approved",
    rejected = "rejected"
}
export enum RunDecision {
    in_progress = "in_progress",
    completed = "completed",
    approved = "approved",
    rejected = "rejected"
}
export enum RunStatus {
    pending = "pending",
    completed = "completed",
    halted = "halted",
    failed = "failed",
    running = "running"
}
export enum SimulationStep {
    asset_binding = "asset_binding",
    fracture = "fracture",
    lore_check = "lore_check",
    ingestion = "ingestion",
    dna_crossref = "dna_crossref"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export enum VideoGenerationStatus {
    generating = "generating",
    not_started = "not_started",
    ready = "ready",
    no_result = "no_result",
    failed = "failed"
}
export enum VideoOutputStatus {
    generating = "generating",
    ready = "ready",
    no_result = "no_result"
}
export interface backendInterface {
    acceptRun(runId: Id, revisionNumber: bigint): Promise<ProductionRun | null>;
    approveSuperSuitPatch(id: Id): Promise<SuperSuitPatch | null>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    attachMediaArtifact(input: AttachMediaInput): Promise<ProductionRun | null>;
    bumpDnaVersion(id: Id): Promise<DnaRecord | null>;
    clearReplicateToken(): Promise<ReplicateTokenStatus>;
    continueRun(runId: Id, revisionNumber: bigint): Promise<ProductionRun | null>;
    createAsset(input: AssetInput): Promise<AssetIngredient>;
    createCameo(input: CameoInput): Promise<CameoCapture>;
    createDna(input: DnaInput): Promise<DnaRecord>;
    createLore(input: LoreInput): Promise<LoreRule>;
    deleteAsset(id: Id): Promise<boolean>;
    deleteCameo(id: Id): Promise<boolean>;
    deleteDna(id: Id): Promise<boolean>;
    deleteLore(id: Id): Promise<boolean>;
    deleteMediaArtifact(runId: Id): Promise<boolean>;
    execute(qJson: string): Promise<Result>;
    getAgentVersion(agent: AgentKind): Promise<AgentVersion | null>;
    getApiDoc(): Promise<string>;
    getAsset(id: Id): Promise<AssetIngredient | null>;
    getCallerUserRole(): Promise<UserRole>;
    getCameo(id: Id): Promise<CameoCapture | null>;
    getCostTelemetry(): Promise<CostTelemetry>;
    getDna(id: Id): Promise<DnaRecord | null>;
    getEntropyState(): Promise<EntropyState>;
    getLore(id: Id): Promise<LoreRule | null>;
    getMediaArtifact(runId: Id): Promise<MediaArtifact | null>;
    getReplicateTokenStatus(): Promise<ReplicateTokenStatus>;
    getRevision(runId: Id, revisionNumber: bigint): Promise<Revision | null>;
    getRun(id: Id): Promise<ProductionRun | null>;
    getRunDecision(runId: Id): Promise<RunDecisionState | null>;
    getSuperSuitPatch(id: Id): Promise<SuperSuitPatch | null>;
    getVideoGeneration(runId: Id): Promise<VideoGeneration | null>;
    isCallerAdmin(): Promise<boolean>;
    listAssets(): Promise<Array<AssetIngredient>>;
    listAssetsForCharacter(characterId: Id): Promise<Array<AssetIngredient>>;
    listCameos(): Promise<Array<CameoCapture>>;
    listCameosForCharacter(characterId: Id): Promise<Array<CameoCapture>>;
    listDna(): Promise<Array<DnaRecord>>;
    listLore(): Promise<Array<LoreRule>>;
    listRevisions(runId: Id): Promise<Array<Revision>>;
    listRunDecisions(): Promise<Array<[Id, RunDecisionState]>>;
    listRunPrompts(runId: Id): Promise<Array<VideoPromptOption>>;
    listRuns(): Promise<Array<RunSummary>>;
    listSimulationLogs(runId: Id): Promise<Array<SimulationLog>>;
    listSuperSuitPatches(): Promise<Array<SuperSuitPatch>>;
    listVideoModels(): Promise<Array<VideoModel>>;
    pollVideoGeneration(runId: Id): Promise<VideoGeneration | null>;
    recoverVideoGeneration(runId: Id): Promise<VideoGeneration | null>;
    rejectRun(runId: Id, reason: string | null): Promise<ProductionRun | null>;
    rejectSuperSuitPatch(id: Id): Promise<SuperSuitPatch | null>;
    rerunVideoGeneration(input: RerunVideoGenerationInput): Promise<VideoGeneration | null>;
    rollbackAgentVersion(agent: AgentKind): Promise<AgentVersion | null>;
    runCriticAgent(): Promise<SuperSuitPatch | null>;
    schema(): Promise<string>;
    setLoreStatus(id: Id, status: LoreStatus): Promise<LoreRule | null>;
    setReplicateToken(token: string): Promise<ReplicateTokenStatus>;
    startProductionRun(input: RunInput): Promise<ProductionRun>;
    startVideoGeneration(input: StartVideoGenerationInput): Promise<VideoGeneration | null>;
    submitTweak(input: TweakInput): Promise<Revision | null>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updateAsset(id: Id, input: AssetInput): Promise<AssetIngredient | null>;
    updateCameo(id: Id, input: CameoInput): Promise<CameoCapture | null>;
    updateDna(id: Id, input: DnaInput): Promise<DnaRecord | null>;
    updateLore(id: Id, input: LoreInput): Promise<LoreRule | null>;
}
