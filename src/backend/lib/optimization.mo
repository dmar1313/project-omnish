import Map "mo:core/Map";
import List "mo:core/List";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Types "../types/optimization";
import ProductionTypes "../types/production";
import Inference "../lib/inference";

module {
  public type OptimizationState = {
    patches : Map.Map<Types.Id, Types.SuperSuitPatch>;
    versions : Map.Map<Text, Types.AgentVersion>;
    entropy : Types.EntropyStateInternal;
    nextPatchId : { var value : Nat };
  };

  let HOUR_NS : Int = 3_600_000_000_000;

  // ---- Reads ----

  public func listPatches(state : OptimizationState) : [Types.SuperSuitPatch] {
    state.patches.values().toArray();
  };

  public func getPatch(state : OptimizationState, id : Types.Id) : ?Types.SuperSuitPatch {
    state.patches.get(id);
  };

  public func getAgentVersion(state : OptimizationState, agent : Types.AgentKind) : ?Types.AgentVersion {
    state.versions.get(agentKey(agent));
  };

  public func getEntropyState(state : OptimizationState) : Types.EntropyState {
    {
      recentUpdateTimestamps = state.entropy.recentUpdateTimestamps;
      maxUpdatesPerHour = state.entropy.maxUpdatesPerHour;
    };
  };

  // ---- Internal helpers ----

  func agentKey(agent : Types.AgentKind) : Text {
    switch (agent) {
      case (#writer) { "writer" };
      case (#visual) { "visual" };
      case (#continuity) { "continuity" };
    };
  };

  // Drop timestamps older than one hour and return the still-recent ones.
  func pruneWindow(timestamps : [Types.Timestamp], now : Types.Timestamp) : [Types.Timestamp] {
    timestamps.filter(func(t) { now - t < HOUR_NS });
  };

  func withinCeiling(state : OptimizationState, now : Types.Timestamp) : Bool {
    let recent = pruneWindow(state.entropy.recentUpdateTimestamps, now);
    recent.size() < state.entropy.maxUpdatesPerHour;
  };

  func recordUpdate(state : OptimizationState, now : Types.Timestamp) {
    let recent = pruneWindow(state.entropy.recentUpdateTimestamps, now);
    state.entropy.recentUpdateTimestamps := recent.concat([now]);
  };

  // Deterministic validation filter: a patch that proposes altering immutable
  // traits or core identity blocks is rejected outright.
  func altersImmutable(patchText : Text) : Bool {
    let lower = patchText.toLower();
    let forbidden = [
      "immutable trait",
      "immutable traits",
      "identity block",
      "identity blocks",
      "core identity",
      "change identity",
      "alter identity",
      "remove trait",
      "remove identity",
      "override identity",
      "replace identity",
    ];
    forbidden.any(func(phrase) { lower.contains(#text phrase) });
  };

  func nextVersionTag(state : OptimizationState, agent : Types.AgentKind) : Text {
    let base = agentKey(agent);
    switch (state.versions.get(base)) {
      case null { base # "-v1" };
      case (?v) {
        let n = v.history.size() + 1;
        base # "-v" # n.toText();
      };
    };
  };

  // ---- Mutations ----

  public func approvePatch(state : OptimizationState, id : Types.Id) : ?Types.SuperSuitPatch {
    switch (state.patches.get(id)) {
      case null { null };
      case (?patch) {
        switch (patch.status) {
          case (#pending_approval) {
            let approved : Types.SuperSuitPatch = {
              id = patch.id;
              targetAgent = patch.targetAgent;
              proposedPromptPatch = patch.proposedPromptPatch;
              performanceDeltaMetrics = patch.performanceDeltaMetrics;
              status = #approved;
              versionTag = patch.versionTag;
              createdAt = patch.createdAt;
            };
            state.patches.add(id, approved);
            // Promote the patch's version tag onto the target agent.
            let key = agentKey(patch.targetAgent);
            switch (state.versions.get(key)) {
              case (?v) {
                let updated : Types.AgentVersion = {
                  agent = v.agent;
                  currentVersion = patch.versionTag;
                  history = v.history.concat([patch.versionTag]);
                };
                state.versions.add(key, updated);
              };
              case null {
                state.versions.add(key, {
                  agent = patch.targetAgent;
                  currentVersion = patch.versionTag;
                  history = [patch.versionTag];
                });
              };
            };
            ?approved;
          };
          case (_) { ?patch };
        };
      };
    };
  };

  public func rejectPatch(state : OptimizationState, id : Types.Id) : ?Types.SuperSuitPatch {
    switch (state.patches.get(id)) {
      case null { null };
      case (?patch) {
        switch (patch.status) {
          case (#pending_approval) {
            let rejected : Types.SuperSuitPatch = {
              id = patch.id;
              targetAgent = patch.targetAgent;
              proposedPromptPatch = patch.proposedPromptPatch;
              performanceDeltaMetrics = patch.performanceDeltaMetrics;
              status = #rejected;
              versionTag = patch.versionTag;
              createdAt = patch.createdAt;
            };
            state.patches.add(id, rejected);
            ?rejected;
          };
          case (_) { ?patch };
        };
      };
    };
  };

  public func rollbackAgent(state : OptimizationState, agent : Types.AgentKind) : ?Types.AgentVersion {
    let key = agentKey(agent);
    switch (state.versions.get(key)) {
      case null { null };
      case (?v) {
        let size = v.history.size();
        if (size < 2) { return ?v };
        // Collect every entry except the last (the current version) without
        // Nat subtraction, which the compiler cannot prove safe.
        let kept = List.empty<Text>();
        var prior : ?Text = null;
        var i = 0;
        for (entry in v.history.values()) {
          if (i + 1 < size) {
            kept.add(entry);
            prior := ?entry;
          };
          i += 1;
        };
        let priorVersion = switch (prior) {
          case (?p) { p };
          case null { return ?v };
        };
        let rolled : Types.AgentVersion = {
          agent = v.agent;
          currentVersion = priorVersion;
          history = kept.toArray();
        };
        state.versions.add(key, rolled);
        ?rolled;
      };
    };
  };

  // ---- Critic Agent ----

  public func runCritic(
    state : OptimizationState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
  ) : async ?Types.SuperSuitPatch {
    let now = Time.now();
    if (not withinCeiling(state, now)) {
      return null;
    };

    // Summarize historical performance for the critic.
    let allRuns = runs.values().toArray();
    let completed = allRuns.filter(func(r) {
      switch (r.status) { case (#completed) { true }; case (_) { false } };
    });
    var totalBurn = 0.0;
    for (r in completed.values()) { totalBurn += r.tokenCostBurn };
    let avgBurn = if (completed.size() == 0) { 0.0 } else { totalBurn / completed.size().toFloat() };

    let historyText = "Completed runs: " # completed.size().toText() #
      ", total token burn: " # totalBurn.toText() #
      ", average burn per run: " # avgBurn.toText();

    let prompt = "You are the Critic Agent for a multi-agent production studio. " #
      "Analyze the historical performance below and draft ONE localized prompt patch (a 'super suit') " #
      "that would improve a single agent (writer, visual, or continuity).\n" #
      "Historical performance: " # historyText # "\n" #
      "Respond in exactly this format:\n" #
      "AGENT: <writer|visual|continuity>\n" #
      "PATCH: <the proposed prompt patch>\n" #
      "METRICS: <expected performance delta>";

    let result = await* Inference.runChat<system>(prompt);
    let parsed = parseCriticResponse(result.text);

    let patchId = state.nextPatchId.value;
    state.nextPatchId.value := patchId + 1;
    let versionTag = nextVersionTag(state, parsed.agent);

    // Deterministic validation filter.
    let status : Types.PatchStatus = if (altersImmutable(parsed.patch)) {
      #rejected;
    } else {
      #pending_approval;
    };

    let patch : Types.SuperSuitPatch = {
      id = patchId;
      targetAgent = parsed.agent;
      proposedPromptPatch = parsed.patch;
      performanceDeltaMetrics = parsed.metrics;
      status;
      versionTag;
      createdAt = now;
    };
    state.patches.add(patchId, patch);
    recordUpdate(state, now);
    ?patch;
  };

  type ParsedCritic = {
    agent : Types.AgentKind;
    patch : Text;
    metrics : Text;
  };

  // Drop the first `n` characters of `text` (used to strip a known label prefix).
  func dropPrefix(text : Text, n : Nat) : Text {
    let chars = text.toArray();
    if (chars.size() <= n) { return "" };
    Text.fromArray(chars.sliceToArray(n, chars.size()));
  };

  func parseCriticResponse(text : Text) : ParsedCritic {
    var agent : Types.AgentKind = #writer;
    var patch = text;
    var metrics = "n/a";
    for (line in text.split(#predicate(func(c) { c == '\n' }))) {
      let trimmed = line.trim(#predicate(func(c) { c == ' ' or c == '\t' or c == '\r' }));
      if (trimmed.toLower().startsWith(#text "agent:")) {
        let value = dropPrefix(trimmed, 6).trim(#predicate(func(c) { c == ' ' }));
        let lower = value.toLower();
        agent := if (lower.contains(#text "visual")) { #visual }
          else if (lower.contains(#text "continuity")) { #continuity }
          else { #writer };
      } else if (trimmed.toLower().startsWith(#text "patch:")) {
        patch := dropPrefix(trimmed, 6).trim(#predicate(func(c) { c == ' ' }));
      } else if (trimmed.toLower().startsWith(#text "metrics:")) {
        metrics := dropPrefix(trimmed, 8).trim(#predicate(func(c) { c == ' ' }));
      };
    };
    { agent; patch; metrics };
  };
};
