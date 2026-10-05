import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/production";
import StudioTypes "../types/studio";
import ProductionLib "../lib/production";

mixin (
  accessControlState : AccessControl.AccessControlState,
  runs : Map.Map<Types.Id, Types.ProductionRun>,
  logs : Map.Map<Types.Id, Types.SimulationLog>,
  dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>,
  lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>,
  assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>,
  nextRunId : { var value : Nat },
  nextLogId : { var value : Nat },
  revisions : Map.Map<Types.Id, [Types.Revision]>,
  decisions : Map.Map<Types.Id, Types.RunDecisionState>,
  mediaArtifacts : Map.Map<Types.Id, Types.MediaArtifact>,
) {
  func requireUserProd(caller : Principal) {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only signed-in users can perform this action");
    };
  };

  func runState() : ProductionLib.RunState {
    { runs; logs; nextRunId; nextLogId; revisions; decisions; mediaArtifacts };
  };

  // Drives the run pipeline to its terminal state inline and returns the
  // settled run. The run is persisted as `#running` / `#generating` before any
  // inference call, so a caller that polls `getRun` / `listSimulationLogs`
  // during processing observes progress; the call itself resolves once the run
  // has settled to `#completed`, `#halted`, or `#failed`.
  public shared ({ caller }) func startProductionRun(input : Types.RunInput) : async Types.ProductionRun {
    requireUserProd(caller);
    await ProductionLib.startRun(runState(), dna, lore, assets, input);
  };

  public query ({ caller }) func listRuns() : async [Types.RunSummary] {
    requireUserProd(caller);
    ProductionLib.listRuns(runState());
  };

  public query ({ caller }) func getRun(id : Types.Id) : async ?Types.ProductionRun {
    requireUserProd(caller);
    ProductionLib.getRun(runState(), id);
  };

  public query ({ caller }) func listSimulationLogs(runId : Types.Id) : async [Types.SimulationLog] {
    requireUserProd(caller);
    ProductionLib.listLogs(runState(), runId);
  };

  public query ({ caller }) func getCostTelemetry() : async Types.CostTelemetry {
    requireUserProd(caller);
    ProductionLib.getTelemetry(runState());
  };

  // ---- Revision + decision flow ----

  public query ({ caller }) func listRevisions(runId : Types.Id) : async [Types.Revision] {
    requireUserProd(caller);
    ProductionLib.listRevisions(runState(), runId);
  };

  public query ({ caller }) func getRevision(runId : Types.Id, revisionNumber : Nat) : async ?Types.Revision {
    requireUserProd(caller);
    ProductionLib.getRevision(runState(), runId, revisionNumber);
  };

  // Returns promptly with the run's `videoStatus` set to `#generating`; the
  // revision regenerates in the background and is appended when it finishes.
  // The return value is always `null` because no revision exists yet — poll
  // `listRevisions(runId)` to observe the new revision.
  public shared ({ caller }) func submitTweak(input : Types.TweakInput) : async ?Types.Revision {
    requireUserProd(caller);
    ignore await ProductionLib.beginTweak(runState(), dna, lore, assets, input);
    null;
  };

  public shared ({ caller }) func acceptRun(runId : Types.Id, revisionNumber : Nat) : async ?Types.ProductionRun {
    requireUserProd(caller);
    ProductionLib.acceptRun(runState(), runId, revisionNumber);
  };

  public shared ({ caller }) func rejectRun(runId : Types.Id, reason : ?Text) : async ?Types.ProductionRun {
    requireUserProd(caller);
    ProductionLib.rejectRun(runState(), runId, reason);
  };

  public shared ({ caller }) func continueRun(runId : Types.Id, revisionNumber : Nat) : async ?Types.ProductionRun {
    requireUserProd(caller);
    ProductionLib.continueRun(runState(), runId, revisionNumber);
  };

  public query ({ caller }) func getRunDecision(runId : Types.Id) : async ?Types.RunDecisionState {
    requireUserProd(caller);
    ProductionLib.getDecision(runState(), runId);
  };

  public query ({ caller }) func listRunDecisions() : async [(Types.Id, Types.RunDecisionState)] {
    requireUserProd(caller);
    ProductionLib.listDecisions(runState());
  };

  // ---- Real media artifact ----

  public shared ({ caller }) func attachMediaArtifact(input : Types.AttachMediaInput) : async ?Types.ProductionRun {
    requireUserProd(caller);
    ProductionLib.attachMediaArtifact(runState(), input);
  };

  public query ({ caller }) func getMediaArtifact(runId : Types.Id) : async ?Types.MediaArtifact {
    requireUserProd(caller);
    ProductionLib.getMediaArtifact(runState(), runId);
  };

  // Delete a run's produced video artifact. Signed-in users only, matching the
  // rest of the production surface. Returns `true` when an artifact was
  // removed, `false` when the run had no artifact or does not exist.
  public shared ({ caller }) func deleteMediaArtifact(runId : Types.Id) : async Bool {
    requireUserProd(caller);
    ProductionLib.deleteMediaArtifact(runState(), runId);
  };
};
