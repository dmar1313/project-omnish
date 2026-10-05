import Common "common";

module {
  public type Id = Common.Id;
  public type Timestamp = Common.Timestamp;

  // ---- Simulation pipeline ----

  public type SimulationStep = {
    #ingestion;
    #asset_binding;
    #dna_crossref;
    #lore_check;
    #fracture;
  };

  public type SimulationLog = {
    id : Id;
    runId : Id;
    rawInput : Text;
    stepName : SimulationStep;
    evaluationOutput : Text;
    timestamp : Timestamp;
  };

  // ---- Production runs ----

  public type RunStatus = {
    #pending;
    #running;
    #completed;
    #halted;
    #failed;
  };

  public type AgentKind = { #writer; #visual; #continuity };

  public type AgentOutput = {
    agent : AgentKind;
    content : Text;
  };

  public type FormatAdapterOutput = {
    platform : Text;
    aspectRatio : Text;
    characterLimit : Nat;
    content : Text;
  };

  // ---- Real media artifact ----

  // Lifecycle of a run's produced video artifact. `#generating` while the
  // artifact is being attached, `#ready` once it is playable, `#failed` if the
  // attachment did not complete.
  public type MediaArtifactStatus = { #generating; #ready; #failed };

  // Honest lifecycle of a run's video output, independent of whether an
  // artifact is attached. `#generating` means the run is still processing (or a
  // revision is being generated) and no final result exists yet; `#ready` means
  // a real media artifact is attached and playable; `#no_result` means
  // processing finished and no artifact was attached. A run's video cuts must
  // never be shown as a final no-result while this is `#generating`.
  public type VideoOutputStatus = { #generating; #ready; #no_result };

  // A reference to a real, playable video file stored via platform file
  // storage. The backend stores only the URL and metadata, never raw bytes.
  public type MediaArtifact = {
    storageUrl : Text;
    mimeType : Text;
    durationSeconds : Float;
    aspectRatio : Text;
    status : MediaArtifactStatus;
    // The character/cameo the artifact was built from, when known.
    characterId : ?Id;
    cameoId : ?Id;
    createdAt : Timestamp;
  };

  public type ProductionRun = {
    id : Id;
    promptId : ?Id;
    characterId : ?Id;
    rawInput : Text;
    status : RunStatus;
    generatedAssets : [AgentOutput];
    formatOutputs : [FormatAdapterOutput];
    tokenCostBurn : Float;
    timestamp : Timestamp;
    // The run's produced video artifact, if one has been attached.
    mediaArtifact : ?MediaArtifact;
    // Honest video-output lifecycle. `#generating` while the run is
    // pending/running or a revision is being generated; `#ready` once a real
    // artifact is attached; `#no_result` once processing finished without one.
    videoStatus : VideoOutputStatus;
  };

  // Input for attaching a user-uploaded video file (already stored via
  // object-storage as an asset with a storageUrl) to a run as its produced
  // video artifact.
  public type AttachMediaInput = {
    runId : Id;
    storageUrl : Text;
    mimeType : Text;
    durationSeconds : Float;
    aspectRatio : Text;
    cameoId : ?Id;
  };

  public type RunInput = {
    rawInput : Text;
    characterId : ?Id;
    assetIngredientIds : [Id];
  };

  public type RunSummary = {
    id : Id;
    characterId : ?Id;
    status : RunStatus;
    tokenCostBurn : Float;
    timestamp : Timestamp;
  };

  // ---- Cost / token telemetry ----

  public type CostTelemetry = {
    totalRuns : Nat;
    totalTokenCostBurn : Float;
    averageCostPerRun : Float;
  };

  // ---- Revision + decision flow ----

  // Operator-facing state of a run. `#in_progress` covers `#pending`/`#running`;
  // `#completed` means generation finished but no decision was taken yet.
  public type RunDecision = {
    #in_progress;
    #completed;
    #approved;
    #rejected;
  };

  // One immutable revision of a run's generated output. Revision 1 is the
  // original generation (`instruction = null`); each tweak appends a new one.
  public type Revision = {
    revisionNumber : Nat;
    instruction : ?Text;
    generatedAssets : [AgentOutput];
    formatOutputs : [FormatAdapterOutput];
    tokenCostBurn : Float;
    timestamp : Timestamp;
  };

  // The decision taken on a run, plus which revision was accepted and an
  // optional rejection reason.
  public type RunDecisionState = {
    decision : RunDecision;
    acceptedRevision : ?Nat;
    rejectionReason : ?Text;
  };

  // Input for a natural-language tweak that regenerates a new revision.
  public type TweakInput = {
    runId : Id;
    instruction : Text;
  };
};
