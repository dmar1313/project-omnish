import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import OutCall "mo:caffeineai-http-outcalls/outcall";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/video";
import ProductionTypes "../types/production";
import VideoLib "../lib/video";

mixin (
  accessControlState : AccessControl.AccessControlState,
  replicateToken : { var value : ?Text },
  generations : Map.Map<Types.Id, Types.VideoGeneration>,
  runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
  mediaArtifacts : Map.Map<ProductionTypes.Id, ProductionTypes.MediaArtifact>,
) {
  func requireUserVideo(caller : Principal) {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only signed-in users can perform this action");
    };
  };

  func requireAdminVideo(caller : Principal) {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can perform this action");
    };
  };

  // Transient per-run poll attempt counters. Not stable, so it is rebuilt after
  // an upgrade; a lost counter simply restarts polling.
  transient let pollAttempts = Map.empty<Types.Id, Nat>();

  // Transient per-run heartbeat of the active polling chain. Not stable, so it
  // is rebuilt after an upgrade; an empty map simply restarts polling.
  transient let activeChains = Map.empty<Types.Id, Int>();

  func videoState() : VideoLib.VideoState {
    { replicateToken; generations; mediaArtifacts; pollAttempts; activeChains };
  };

  // The IC transform callback for the Replicate outcall. Strips response
  // headers so the response is deterministic across replicas.
  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  // ---- Model catalog ----

  // The selectable generation models. Kling 3.0 is the default; Veo 3.1 is the
  // premium option.
  public query ({ caller }) func listVideoModels() : async [Types.VideoModel] {
    requireUserVideo(caller);
    VideoLib.listModels();
  };

  // ---- Prompt selection ----

  // The selectable prompt/cut options for a run, so the user can choose which
  // single prompt to generate. Signed-in users only. Returns an empty array when
  // the run has no generated assets yet.
  public query ({ caller }) func listRunPrompts(runId : Types.Id) : async [Types.VideoPromptOption] {
    requireUserVideo(caller);
    VideoLib.listRunPrompts(runs, runId);
  };

  // ---- Token configuration (admin only) ----

  // Whether an admin-configured Replicate API token is present. The token value
  // is never returned.
  public query ({ caller }) func getReplicateTokenStatus() : async Types.ReplicateTokenStatus {
    requireUserVideo(caller);
    VideoLib.getTokenStatus(videoState());
  };

  // Set the Replicate API token. Admin only.
  public shared ({ caller }) func setReplicateToken(token : Text) : async Types.ReplicateTokenStatus {
    requireAdminVideo(caller);
    VideoLib.setToken(videoState(), token);
  };

  // Clear the Replicate API token. Admin only.
  public shared ({ caller }) func clearReplicateToken() : async Types.ReplicateTokenStatus {
    requireAdminVideo(caller);
    VideoLib.clearToken(videoState());
  };

  // ---- Generation ----

  // Start generation for an accepted run with a chosen model and prompt.
  // Signed-in users only. Exactly one prompt is submitted. Traps when the run is
  // not generatable or the chosen prompt index is out of range.
  public shared ({ caller }) func startVideoGeneration(input : Types.StartVideoGenerationInput) : async ?Types.VideoGeneration {
    requireUserVideo(caller);
    await VideoLib.startGeneration(videoState(), runs, input, transform);
  };

  // Re-run generation for a prior run. Signed-in users only. Traps when no prior
  // generation exists or the chosen prompt index is out of range.
  public shared ({ caller }) func rerunVideoGeneration(input : Types.RerunVideoGenerationInput) : async ?Types.VideoGeneration {
    requireUserVideo(caller);
    await VideoLib.rerunGeneration(videoState(), runs, input, transform);
  };

  // Read a run's current generation state for polling, or `null` when
  // generation has never been started for the run.
  public query ({ caller }) func getVideoGeneration(runId : Types.Id) : async ?Types.VideoGeneration {
    requireUserVideo(caller);
    VideoLib.getGeneration(videoState(), runId);
  };

  // Poll an in-flight generation against the provider and settle it when the
  // prediction has finished. Signed-in users only. Returns the generation's
  // current state, or `null` when no generation exists for the run.
  public shared ({ caller }) func pollVideoGeneration(runId : Types.Id) : async ?Types.VideoGeneration {
    requireUserVideo(caller);
    await VideoLib.pollGeneration(videoState(), runs, runId, transform);
  };

  // Recover a generation that was started but never settled in the app (for
  // example one visible on the provider dashboard). Signed-in users only.
  // Returns the generation's current state, or `null` when no generation exists
  // for the run.
  public shared ({ caller }) func recoverVideoGeneration(runId : Types.Id) : async ?Types.VideoGeneration {
    requireUserVideo(caller);
    await VideoLib.recoverGeneration(videoState(), runs, runId, transform);
  };
};
