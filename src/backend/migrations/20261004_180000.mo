import Map "mo:core/Map";
import AccessControl "mo:caffeineai-authorization/access-control";

module {
  type Id = Nat;
  type Timestamp = Int;

  type DnaRecord = {
    id : Id;
    characterName : Text;
    identityBlocks : Text;
    visualMarkers : Text;
    immutableTraits : Text;
    activeVersion : Nat;
    createdAt : Timestamp;
  };

  type LoreStatus = { #active; #deprecated };

  type LoreRule = {
    id : Id;
    ruleName : Text;
    timelineConstraints : Text;
    universeBounds : Text;
    status : LoreStatus;
    createdAt : Timestamp;
  };

  type AssetKind = { #image; #video; #audio };

  type AssetIngredient = {
    id : Id;
    fileName : Text;
    fileType : AssetKind;
    storageUrl : Text;
    tags : [Text];
    linkedCharacterId : ?Id;
    createdAt : Timestamp;
  };

  type SimulationStep = {
    #ingestion;
    #asset_binding;
    #dna_crossref;
    #lore_check;
    #fracture;
  };

  type SimulationLog = {
    id : Id;
    runId : Id;
    rawInput : Text;
    stepName : SimulationStep;
    evaluationOutput : Text;
    timestamp : Timestamp;
  };

  type RunStatus = {
    #pending;
    #running;
    #completed;
    #halted;
    #failed;
  };

  type AgentKind = { #writer; #visual; #continuity };

  type AgentOutput = {
    agent : AgentKind;
    content : Text;
  };

  type FormatAdapterOutput = {
    platform : Text;
    aspectRatio : Text;
    characterLimit : Nat;
    content : Text;
  };

  type ProductionRun = {
    id : Id;
    promptId : ?Id;
    characterId : ?Id;
    rawInput : Text;
    status : RunStatus;
    generatedAssets : [AgentOutput];
    formatOutputs : [FormatAdapterOutput];
    tokenCostBurn : Float;
    timestamp : Timestamp;
  };

  type RunDecision = {
    #in_progress;
    #completed;
    #approved;
    #rejected;
  };

  type Revision = {
    revisionNumber : Id;
    instruction : ?Text;
    generatedAssets : [AgentOutput];
    formatOutputs : [FormatAdapterOutput];
    tokenCostBurn : Float;
    timestamp : Timestamp;
  };

  type RunDecisionState = {
    decision : RunDecision;
    acceptedRevision : ?Id;
    rejectionReason : ?Text;
  };

  type PatchStatus = { #pending_approval; #rejected; #approved };

  type SuperSuitPatch = {
    id : Id;
    targetAgent : AgentKind;
    proposedPromptPatch : Text;
    performanceDeltaMetrics : Text;
    status : PatchStatus;
    versionTag : Text;
    createdAt : Timestamp;
  };

  type AgentVersion = {
    agent : AgentKind;
    currentVersion : Text;
    history : [Text];
  };

  type EntropyStateInternal = {
    var recentUpdateTimestamps : [Timestamp];
    maxUpdatesPerHour : Nat;
  };

  type CameoStatus = { #draft; #complete };

  type CameoCapture = {
    id : Id;
    characterId : Id;
    frontAssetId : ?Id;
    leftAssetId : ?Id;
    rightAssetId : ?Id;
    voiceAssetId : ?Id;
    status : CameoStatus;
    createdAt : Timestamp;
  };

  // OldActor equals the NewActor of the preceding migration (20261004_120000.mo).
  type OldActor = {
    accessControlState : AccessControl.AccessControlState;
    dna : Map.Map<Id, DnaRecord>;
    lore : Map.Map<Id, LoreRule>;
    assets : Map.Map<Id, AssetIngredient>;
    nextDnaId : { var value : Nat };
    nextLoreId : { var value : Nat };
    nextAssetId : { var value : Nat };
    cameos : Map.Map<Id, CameoCapture>;
    nextCameoId : { var value : Nat };
    runs : Map.Map<Id, ProductionRun>;
    logs : Map.Map<Id, SimulationLog>;
    nextRunId : { var value : Nat };
    nextLogId : { var value : Nat };
    patches : Map.Map<Id, SuperSuitPatch>;
    versions : Map.Map<Text, AgentVersion>;
    entropy : EntropyStateInternal;
    nextPatchId : { var value : Nat };
  };

  type NewActor = {
    accessControlState : AccessControl.AccessControlState;
    dna : Map.Map<Id, DnaRecord>;
    lore : Map.Map<Id, LoreRule>;
    assets : Map.Map<Id, AssetIngredient>;
    nextDnaId : { var value : Nat };
    nextLoreId : { var value : Nat };
    nextAssetId : { var value : Nat };
    cameos : Map.Map<Id, CameoCapture>;
    nextCameoId : { var value : Nat };
    runs : Map.Map<Id, ProductionRun>;
    logs : Map.Map<Id, SimulationLog>;
    nextRunId : { var value : Nat };
    nextLogId : { var value : Nat };
    revisions : Map.Map<Id, [Revision]>;
    decisions : Map.Map<Id, RunDecisionState>;
    patches : Map.Map<Id, SuperSuitPatch>;
    versions : Map.Map<Text, AgentVersion>;
    entropy : EntropyStateInternal;
    nextPatchId : { var value : Nat };
  };

  public func migration(old : OldActor) : NewActor {
    // Seed revision 1 (the original generation) and an initial decision state
    // for every pre-existing run, so old completed runs have a revision history
    // and an enabled Accept.
    let revisions = Map.empty<Id, [Revision]>();
    let decisions = Map.empty<Id, RunDecisionState>();
    for ((runId, run) in old.runs.entries()) {
      let revision : Revision = {
        revisionNumber = 1;
        instruction = null;
        generatedAssets = run.generatedAssets;
        formatOutputs = run.formatOutputs;
        tokenCostBurn = run.tokenCostBurn;
        timestamp = run.timestamp;
      };
      revisions.add(runId, [revision]);
      let decision : RunDecision = switch (run.status) {
        case (#completed) { #completed };
        case (#pending) { #in_progress };
        case (#running) { #in_progress };
        case (#halted) { #in_progress };
        case (#failed) { #in_progress };
      };
      decisions.add(runId, {
        decision;
        acceptedRevision = null;
        rejectionReason = null;
      });
    };
    {
      accessControlState = old.accessControlState;
      dna = old.dna;
      lore = old.lore;
      assets = old.assets;
      nextDnaId = old.nextDnaId;
      nextLoreId = old.nextLoreId;
      nextAssetId = old.nextAssetId;
      cameos = old.cameos;
      nextCameoId = old.nextCameoId;
      runs = old.runs;
      logs = old.logs;
      nextRunId = old.nextRunId;
      nextLogId = old.nextLogId;
      revisions;
      decisions;
      patches = old.patches;
      versions = old.versions;
      entropy = old.entropy;
      nextPatchId = old.nextPatchId;
    };
  };
};
