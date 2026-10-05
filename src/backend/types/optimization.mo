import Common "common";
import Production "production";

module {
  public type Id = Common.Id;
  public type Timestamp = Common.Timestamp;
  public type VersionTag = Common.VersionTag;
  public type AgentKind = Production.AgentKind;

  public type PatchStatus = { #pending_approval; #rejected; #approved };

  public type SuperSuitPatch = {
    id : Id;
    targetAgent : AgentKind;
    proposedPromptPatch : Text;
    performanceDeltaMetrics : Text;
    status : PatchStatus;
    versionTag : VersionTag;
    createdAt : Timestamp;
  };

  public type AgentVersion = {
    agent : AgentKind;
    currentVersion : VersionTag;
    history : [VersionTag];
  };

  // Public, shared view of the entropy ceiling.
  public type EntropyState = {
    recentUpdateTimestamps : [Timestamp];
    maxUpdatesPerHour : Nat;
  };

  // Internal mutable state, shared by reference with the optimization mixin.
  public type EntropyStateInternal = {
    var recentUpdateTimestamps : [Timestamp];
    maxUpdatesPerHour : Nat;
  };
};
