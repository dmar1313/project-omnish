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

  type OldActor = {};

  type NewActor = {
    accessControlState : AccessControl.AccessControlState;
    dna : Map.Map<Id, DnaRecord>;
    lore : Map.Map<Id, LoreRule>;
    assets : Map.Map<Id, AssetIngredient>;
    nextDnaId : { var value : Nat };
    nextLoreId : { var value : Nat };
    nextAssetId : { var value : Nat };
    runs : Map.Map<Id, ProductionRun>;
    logs : Map.Map<Id, SimulationLog>;
    nextRunId : { var value : Nat };
    nextLogId : { var value : Nat };
    patches : Map.Map<Id, SuperSuitPatch>;
    versions : Map.Map<Text, AgentVersion>;
    entropy : EntropyStateInternal;
    nextPatchId : { var value : Nat };
  };

  func seedDna() : Map.Map<Id, DnaRecord> {
    let m = Map.empty<Id, DnaRecord>();
    m.add(0, {
      id = 0;
      characterName = "Captain Vela";
      identityBlocks = "Veteran deep-space courier; dry wit; protects her crew above all.";
      visualMarkers = "Silver flight jacket, #C0C0C0; scar over left brow; amber visor.";
      immutableTraits = "loyal, scarred, human";
      activeVersion = 1;
      createdAt = 0;
    });
    m.add(1, {
      id = 1;
      characterName = "The Archivist";
      identityBlocks = "Ancient keeper of forbidden records; speaks in measured riddles.";
      visualMarkers = "Ink-stained robes, #1B1B2F; brass monocle; floating glyphs.";
      immutableTraits = "immortal, neutral, cryptic";
      activeVersion = 1;
      createdAt = 0;
    });
    m;
  };

  func seedLore() : Map.Map<Id, LoreRule> {
    let m = Map.empty<Id, LoreRule>();
    m.add(0, {
      id = 0;
      ruleName = "No Faster-Than-Light Travel";
      timelineConstraints = "all events occur after the Collapse";
      universeBounds = "single star system, no wormholes";
      status = #active;
      createdAt = 0;
    });
    m.add(1, {
      id = 1;
      ruleName = "The Archive Is Inviolable";
      timelineConstraints = "records predate the Collapse";
      universeBounds = "the Archive cannot be destroyed or moved";
      status = #active;
      createdAt = 0;
    });
    m;
  };

  func seedAssets() : Map.Map<Id, AssetIngredient> {
    let m = Map.empty<Id, AssetIngredient>();
    m.add(0, {
      id = 0;
      fileName = "vela-reference.png";
      fileType = #image;
      storageUrl = "https://example.invalid/assets/vela-reference.png";
      tags = ["reference", "portrait"];
      linkedCharacterId = ?0;
      createdAt = 0;
    });
    m.add(1, {
      id = 1;
      fileName = "archive-hall.mp4";
      fileType = #video;
      storageUrl = "https://example.invalid/assets/archive-hall.mp4";
      tags = ["environment", "mood"];
      linkedCharacterId = ?1;
      createdAt = 0;
    });
    m;
  };

  public func migration(_ : OldActor) : NewActor {
    {
      accessControlState = AccessControl.initState();
      dna = seedDna();
      lore = seedLore();
      assets = seedAssets();
      nextDnaId = { var value = 2 };
      nextLoreId = { var value = 2 };
      nextAssetId = { var value = 2 };
      runs = Map.empty();
      logs = Map.empty();
      nextRunId = { var value = 0 };
      nextLogId = { var value = 0 };
      patches = Map.empty();
      versions = Map.empty();
      entropy = { var recentUpdateTimestamps = []; maxUpdatesPerHour = 3 };
      nextPatchId = { var value = 0 };
    };
  };
};
