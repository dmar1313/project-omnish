import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/optimization";
import ProductionTypes "../types/production";
import OptimizationLib "../lib/optimization";

mixin (
  accessControlState : AccessControl.AccessControlState,
  patches : Map.Map<Types.Id, Types.SuperSuitPatch>,
  versions : Map.Map<Text, Types.AgentVersion>,
  entropy : Types.EntropyStateInternal,
  nextPatchId : { var value : Nat },
  runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
) {
  func requireAdmin(caller : Principal) {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can perform this action");
    };
  };

  func optState() : OptimizationLib.OptimizationState {
    { patches; versions; entropy; nextPatchId };
  };

  public query ({ caller }) func listSuperSuitPatches() : async [Types.SuperSuitPatch] {
    requireAdmin(caller);
    OptimizationLib.listPatches(optState());
  };

  public query ({ caller }) func getSuperSuitPatch(id : Types.Id) : async ?Types.SuperSuitPatch {
    requireAdmin(caller);
    OptimizationLib.getPatch(optState(), id);
  };

  public shared ({ caller }) func approveSuperSuitPatch(id : Types.Id) : async ?Types.SuperSuitPatch {
    requireAdmin(caller);
    OptimizationLib.approvePatch(optState(), id);
  };

  public shared ({ caller }) func rejectSuperSuitPatch(id : Types.Id) : async ?Types.SuperSuitPatch {
    requireAdmin(caller);
    OptimizationLib.rejectPatch(optState(), id);
  };

  public query ({ caller }) func getAgentVersion(agent : Types.AgentKind) : async ?Types.AgentVersion {
    requireAdmin(caller);
    OptimizationLib.getAgentVersion(optState(), agent);
  };

  public shared ({ caller }) func rollbackAgentVersion(agent : Types.AgentKind) : async ?Types.AgentVersion {
    requireAdmin(caller);
    OptimizationLib.rollbackAgent(optState(), agent);
  };

  public query ({ caller }) func getEntropyState() : async Types.EntropyState {
    requireAdmin(caller);
    OptimizationLib.getEntropyState(optState());
  };

  public shared ({ caller }) func runCriticAgent() : async ?Types.SuperSuitPatch {
    requireAdmin(caller);
    await OptimizationLib.runCritic(optState(), runs);
  };
};
