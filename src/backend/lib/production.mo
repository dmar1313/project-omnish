import Map "mo:core/Map";
import List "mo:core/List";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import Text "mo:core/Text";
import Types "../types/production";
import StudioTypes "../types/studio";
import Inference "../lib/inference";

module {
  public type RunState = {
    runs : Map.Map<Types.Id, Types.ProductionRun>;
    logs : Map.Map<Types.Id, Types.SimulationLog>;
    nextRunId : { var value : Nat };
    nextLogId : { var value : Nat };
    revisions : Map.Map<Types.Id, [Types.Revision]>;
    decisions : Map.Map<Types.Id, Types.RunDecisionState>;
    mediaArtifacts : Map.Map<Types.Id, Types.MediaArtifact>;
  };

  // ---- Reads ----

  public func listRuns(state : RunState) : [Types.RunSummary] {
    state.runs.values().map(func(run) {
      {
        id = run.id;
        characterId = run.characterId;
        status = run.status;
        tokenCostBurn = run.tokenCostBurn;
        timestamp = run.timestamp;
      };
    }).toArray();
  };

  public func getRun(state : RunState, id : Types.Id) : ?Types.ProductionRun {
    state.runs.get(id);
  };

  public func listLogs(state : RunState, runId : Types.Id) : [Types.SimulationLog] {
    state.logs.values().filter(func(log) { log.runId == runId }).toArray();
  };

  public func getTelemetry(state : RunState) : Types.CostTelemetry {
    var totalRuns = 0;
    var totalBurn = 0.0;
    for (run in state.runs.values()) {
      totalRuns += 1;
      totalBurn += run.tokenCostBurn;
    };
    let average = if (totalRuns == 0) { 0.0 } else { totalBurn / totalRuns.toFloat() };
    {
      totalRuns;
      totalTokenCostBurn = totalBurn;
      averageCostPerRun = average;
    };
  };

  // ---- Internal helpers ----

  func appendLog(state : RunState, runId : Types.Id, rawInput : Text, step : Types.SimulationStep, output : Text) {
    let id = state.nextLogId.value;
    state.nextLogId.value := id + 1;
    let log : Types.SimulationLog = {
      id;
      runId;
      rawInput;
      stepName = step;
      evaluationOutput = output;
      timestamp = Time.now();
    };
    state.logs.add(id, log);
  };

  func storeRun(state : RunState, run : Types.ProductionRun) {
    state.runs.add(run.id, run);
  };

  // Seed revision 1 (the original generation) and the initial decision state
  // for a run. Called for every run the pipeline persists.
  func seedRevision(state : RunState, run : Types.ProductionRun) {
    let revision : Types.Revision = {
      revisionNumber = 1;
      instruction = null;
      generatedAssets = run.generatedAssets;
      formatOutputs = run.formatOutputs;
      tokenCostBurn = run.tokenCostBurn;
      timestamp = run.timestamp;
    };
    state.revisions.add(run.id, [revision]);
    let decision : Types.RunDecision = switch (run.status) {
      case (#completed) { #completed };
      case (#pending) { #in_progress };
      case (#running) { #in_progress };
      case (#halted) { #in_progress };
      case (#failed) { #in_progress };
    };
    state.decisions.add(run.id, {
      decision;
      acceptedRevision = null;
      rejectionReason = null;
    });
  };

  // Replace a run's stored record, preserving its identity fields.
  func updateRunStatus(state : RunState, run : Types.ProductionRun, status : Types.RunStatus) : Types.ProductionRun {
    let updated : Types.ProductionRun = {
      id = run.id;
      promptId = run.promptId;
      characterId = run.characterId;
      rawInput = run.rawInput;
      status;
      generatedAssets = run.generatedAssets;
      formatOutputs = run.formatOutputs;
      tokenCostBurn = run.tokenCostBurn;
      timestamp = run.timestamp;
      mediaArtifact = run.mediaArtifact;
      videoStatus = run.videoStatus;
    };
    storeRun(state, updated);
    updated;
  };

  // The honest video-output state for a run that has finished processing: a
  // real attached artifact means `#ready`, otherwise there is genuinely no
  // result. Never returns `#generating` — that is only for in-flight runs.
  func terminalVideoStatus(mediaArtifact : ?Types.MediaArtifact) : Types.VideoOutputStatus {
    switch (mediaArtifact) {
      case (?_) { #ready };
      case null { #no_result };
    };
  };

  // Build the three agent prompts for a run, optionally folding in a
  // natural-language tweak instruction.
  func buildPrompts(
    character : ?StudioTypes.DnaRecord,
    lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>,
    bound : [StudioTypes.AssetIngredient],
    rawInput : Text,
    instruction : ?Text,
  ) : { writer : Text; visual : Text; continuity : Text } {
    let characterName = switch (character) {
      case (?c) { c.characterName };
      case null { "the protagonist" };
    };
    let visualMarkers = switch (character) {
      case (?c) { c.visualMarkers };
      case null { "(no fixed visual markers)" };
    };
    let identityBlocks = switch (character) {
      case (?c) { c.identityBlocks };
      case null { "(no identity blocks)" };
    };
    let loreText = activeLoreText(lore);
    let assetText = describeAssets(bound);
    let tweak = switch (instruction) {
      case (?t) { "\nOperator tweak request (apply this change): " # t # "\n" };
      case null { "" };
    };
    {
      writer = "You are the Writer Agent for a production studio. Write a short script/caption for the following idea, strictly in the voice of " # characterName # ".\n" #
        "Identity blocks: " # identityBlocks # "\n" #
        "Idea: " # rawInput # "\n" # tweak #
        "Return only the finished text.";
      visual = "You are the Visual Agent. Produce a precise image/video generation prompt for the following idea.\n" #
        "Fixed visual markers: " # visualMarkers # "\n" #
        "Referenced ingredient assets: " # assetText # "\n" #
        "Idea: " # rawInput # "\n" # tweak #
        "Return only the generation prompt text.";
      continuity = "You are the Continuity Agent. Audit the following idea against the world lore and report any drift.\n" #
        "World Lore:\n" # loreText # "\n" #
        "Idea: " # rawInput # "\n" # tweak #
        "Return a short audit verdict.";
    };
  };

  // Assemble the format-adapter outputs from the writer/visual results.
  func buildFormatOutputs(writerText : Text, visualText : Text) : [Types.FormatAdapterOutput] {
    [
      {
        platform = "vertical_video";
        aspectRatio = "9:16";
        characterLimit = 2200;
        content = visualText;
      },
      {
        platform = "social_post";
        aspectRatio = "1:1";
        characterLimit = 280;
        content = truncate(writerText, 280);
      },
      {
        platform = "long_form";
        aspectRatio = "16:9";
        characterLimit = 5000;
        content = writerText;
      },
    ];
  };

  // Settle an in-flight run to `#failed` without trapping, recording the
  // honest reason in a `fracture` log. Used on every inference failure path so
  // a run always reaches a terminal state instead of remaining `#running`.
  func settleFailed(state : RunState, runId : Types.Id, input : Types.RunInput, reason : Text) {
    appendLog(state, runId, input.rawInput, #fracture, "FAILED. " # reason);
    let failed : Types.ProductionRun = {
      id = runId;
      promptId = null;
      characterId = input.characterId;
      rawInput = input.rawInput;
      status = #failed;
      generatedAssets = [];
      formatOutputs = [];
      tokenCostBurn = 0.0;
      timestamp = Time.now();
      mediaArtifact = null;
      videoStatus = #no_result;
    };
    storeRun(state, failed);
    seedRevision(state, failed);
  };

  func containsIgnoreCase(haystack : Text, needle : Text) : Bool {
    if (needle.size() == 0) { return true };
    haystack.toLower().contains(#text (needle.toLower()));
  };

  // Split a comma/newline separated trait list into trimmed non-empty tokens.
  func splitTraits(raw : Text) : [Text] {
    let parts = raw.split(#predicate(func(c) { c == ',' or c == '\n' or c == ';' }));
    parts.map(func(p) { p.trim(#predicate(func(c) { c == ' ' or c == '\t' })) })
      .filter(func(p) { p.size() > 0 })
      .toArray();
  };

  // A lore rule conflicts when the raw input mentions the rule name or any of
  // its constraint tokens. This is a deterministic keyword cross-reference.
  func loreConflicts(rawInput : Text, rule : StudioTypes.LoreRule) : Bool {
    if (containsIgnoreCase(rawInput, rule.ruleName)) { return true };
    let tokens = splitTraits(rule.timelineConstraints).concat(splitTraits(rule.universeBounds));
    tokens.any(func(t) { containsIgnoreCase(rawInput, t) });
  };

  // An immutable trait is violated when the input explicitly negates it.
  func traitViolated(rawInput : Text, trait : Text) : Bool {
    let lower = rawInput.toLower();
    let t = trait.toLower();
    lower.contains(#text ("not " # t)) or
    lower.contains(#text ("no " # t)) or
    lower.contains(#text ("without " # t)) or
    lower.contains(#text ("remove " # t)) or
    lower.contains(#text ("change " # t)) or
    lower.contains(#text ("alter " # t));
  };

  func findCharacter(dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>, characterId : ?StudioTypes.Id) : ?StudioTypes.DnaRecord {
    switch (characterId) {
      case null { null };
      case (?id) { dna.get(id) };
    };
  };

  func boundAssets(assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>, ids : [Types.Id]) : [StudioTypes.AssetIngredient] {
    let out = List.empty<StudioTypes.AssetIngredient>();
    for (id in ids.values()) {
      switch (assets.get(id)) {
        case (?a) { out.add(a) };
        case null {};
      };
    };
    out.toArray();
  };

  func describeAssets(bound : [StudioTypes.AssetIngredient]) : Text {
    if (bound.size() == 0) { return "(none)" };
    bound.map(func(a) {
      let kind = switch (a.fileType) {
        case (#image) { "image" };
        case (#video) { "video" };
        case (#audio) { "audio" };
      };
      a.fileName # " [" # kind # "] " # a.storageUrl;
    }).values().join("; ");
  };

  func describeCharacter(character : ?StudioTypes.DnaRecord) : Text {
    switch (character) {
      case null { "(no character selected)" };
      case (?c) {
        "Character: " # c.characterName #
        "\nIdentity blocks: " # c.identityBlocks #
        "\nVisual markers: " # c.visualMarkers #
        "\nImmutable traits: " # c.immutableTraits;
      };
    };
  };

  func activeLoreText(lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>) : Text {
    let active = lore.values().filter(func(r) {
      switch (r.status) { case (#active) { true }; case (#deprecated) { false } };
    }).toArray();
    if (active.size() == 0) { return "(no active lore rules)" };
    active.map(func(r) {
      r.ruleName # ": timeline[" # r.timelineConstraints # "] bounds[" # r.universeBounds # "]";
    }).values().join("\n");
  };

  // ---- Pipeline ----

  // Allocate a run, persist it in an active state, then drive the pipeline to
  // its terminal state inline. Processing is awaited rather than deferred on a
  // timer continuation: a dropped continuation would otherwise leave the run
  // permanently `#running` with no honest error, so the run always progresses
  // through its stages or settles to a terminal state before this returns.
  public func startRun(
    state : RunState,
    dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>,
    lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>,
    assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>,
    input : Types.RunInput,
  ) : async Types.ProductionRun {
    let runId = state.nextRunId.value;
    state.nextRunId.value := runId + 1;

    // Persist the run in an active state BEFORE any inference call so the
    // frontend can observe it and poll for incremental stage logs.
    let running : Types.ProductionRun = {
      id = runId;
      promptId = null;
      characterId = input.characterId;
      rawInput = input.rawInput;
      status = #running;
      generatedAssets = [];
      formatOutputs = [];
      tokenCostBurn = 0.0;
      timestamp = Time.now();
      mediaArtifact = null;
      // The run is in flight, so its video output is honestly still generating.
      videoStatus = #generating;
    };
    storeRun(state, running);

    // Drive the pipeline inline. `processRun` is written never to trap, but the
    // call is still guarded so that any unexpected trap settles the run to an
    // honest terminal error instead of rolling the whole update back.
    try {
      await processRun(state, dna, lore, assets, runId, input);
    } catch (_) {
      settleFailed(state, runId, input, "Run pipeline aborted unexpectedly.");
    };

    // Terminal-state guarantee: a run must never remain `#running` with no
    // progress. If processing somehow returned without settling the run (or the
    // record was lost), settle it to `#failed` with an honest reason.
    switch (state.runs.get(runId)) {
      case (?run) {
        switch (run.status) {
          case (#running) {
            settleFailed(state, runId, input, "Run pipeline did not reach a terminal state.");
          };
          case (_) {};
        };
      };
      case null {
        settleFailed(state, runId, input, "Run record was lost during processing.");
      };
    };

    // Return the settled run so the caller observes its terminal status.
    state.runs.get(runId) ?? running;
  };

  // Performs the full pipeline and settles the run to its terminal state.
  // Awaited inline by `startRun`, and wrapped so it never traps: an inference
  // failure settles the run to `#failed`, a lore/identity conflict settles it
  // to `#halted`, and any unexpected trap settles it to `#failed` as well.
  public func processRun(
    state : RunState,
    dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>,
    lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>,
    assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>,
    runId : Types.Id,
    input : Types.RunInput,
  ) : async () {
    // The whole pipeline is wrapped so an unexpected trap can never propagate
    // out of `processRun` and leave the run active. Every failure path settles
    // the run to an explicit terminal status with an honest reason.
    try {
    let character = findCharacter(dna, input.characterId);
    let bound = boundAssets(assets, input.assetIngredientIds);

    // Step 1: ingestion — deconstruct intent.
    appendLog(
      state,
      runId,
      input.rawInput,
      #ingestion,
      "Ingested raw idea (" # input.rawInput.size().toText() # " chars). Intent deconstructed; " #
      bound.size().toText() # " asset ingredient(s) staged.",
    );

    // Step 2: asset_binding — bind uploaded assets.
    appendLog(
      state,
      runId,
      input.rawInput,
      #asset_binding,
      "Bound assets: " # describeAssets(bound),
    );

    // Step 3: dna_crossref — cross-reference against the DNA registry.
    appendLog(
      state,
      runId,
      input.rawInput,
      #dna_crossref,
      "DNA cross-reference. " # describeCharacter(character),
    );

    // Step 4: lore_check — blocking validation against active lore + immutable traits.
    var violation : ?Text = null;
    for (rule in lore.values()) {
      switch (rule.status) {
        case (#active) {
          if (violation == null and loreConflicts(input.rawInput, rule)) {
            violation := ?("World Lore violation: input conflicts with active rule '" # rule.ruleName # "'.");
          };
        };
        case (#deprecated) {};
      };
    };
    switch (character) {
      case (?c) {
        if (violation == null) {
          let traits = splitTraits(c.immutableTraits);
          switch (traits.find(func(t) { traitViolated(input.rawInput, t) })) {
            case (?t) { violation := ?("Identity violation: input alters immutable trait '" # t # "'.") };
            case null {};
          };
        };
      };
      case null {};
    };

    switch (violation) {
      case (?reason) {
        appendLog(state, runId, input.rawInput, #lore_check, "BLOCKED. " # reason);
        let halted : Types.ProductionRun = {
          id = runId;
          promptId = null;
          characterId = input.characterId;
          rawInput = input.rawInput;
          status = #halted;
          generatedAssets = [];
          formatOutputs = [];
          tokenCostBurn = 0.0;
          timestamp = Time.now();
          mediaArtifact = null;
          videoStatus = #no_result;
        };
        storeRun(state, halted);
        seedRevision(state, halted);
        return;
      };
      case null {
        appendLog(state, runId, input.rawInput, #lore_check, "PASSED. No active lore or identity conflict detected.");
      };
    };

    // Step 5: fracture — split into specialized sub-prompts.
    appendLog(
      state,
      runId,
      input.rawInput,
      #fracture,
      "Fractured into 3 specialized sub-prompts (writer, visual, continuity) carrying " #
      bound.size().toText() # " bound media reference(s).",
    );

    // ---- Multi-agent production team ----

    let prompts = buildPrompts(character, lore, bound, input.rawInput, null);

    // The inference capability is a platform condition, not something the app
    // can fix. Probe it before calling so a run in an environment without
    // credentials settles to an honest terminal error deterministically,
    // instead of depending on catching a trap raised inside an awaited call.
    if (not (await Inference.isAvailable<system>())) {
      settleFailed(
        state,
        runId,
        input,
        "Inference capability is unavailable in this environment; no agent output could be produced.",
      );
      return;
    };

    // Run the three worker agents sequentially, logging each stage as it
    // completes so the Simulation Inspector streams progress incrementally.
    let writerResult = try {
      let r = await* Inference.runChat<system>(prompts.writer);
      appendLog(state, runId, input.rawInput, #fracture, "Writer Agent completed (" # r.tokens.toText() # " tokens).");
      r;
    } catch (_) {
      settleFailed(state, runId, input, "Agent inference call did not complete.");
      return;
    };
    let visualResult = try {
      let r = await* Inference.runChat<system>(prompts.visual);
      appendLog(state, runId, input.rawInput, #fracture, "Visual Agent completed (" # r.tokens.toText() # " tokens).");
      r;
    } catch (_) {
      settleFailed(state, runId, input, "Agent inference call did not complete.");
      return;
    };
    let continuityResult = try {
      let r = await* Inference.runChat<system>(prompts.continuity);
      appendLog(state, runId, input.rawInput, #fracture, "Continuity Agent completed (" # r.tokens.toText() # " tokens).");
      r;
    } catch (_) {
      settleFailed(state, runId, input, "Agent inference call did not complete.");
      return;
    };

    let agentOutputs : [Types.AgentOutput] = [
      { agent = #writer; content = writerResult.text },
      { agent = #visual; content = visualResult.text },
      { agent = #continuity; content = continuityResult.text },
    ];

    // ---- Format Adapter Layer ----

    let formatOutputs = buildFormatOutputs(writerResult.text, visualResult.text);

    let totalBurn = writerResult.tokens + visualResult.tokens + continuityResult.tokens;

    let run : Types.ProductionRun = {
      id = runId;
      promptId = null;
      characterId = input.characterId;
      rawInput = input.rawInput;
      status = #completed;
      generatedAssets = agentOutputs;
      formatOutputs;
      tokenCostBurn = totalBurn;
      timestamp = Time.now();
      mediaArtifact = null;
      // Processing finished with no attached artifact: an honest no-result.
      videoStatus = #no_result;
    };
    storeRun(state, run);
    seedRevision(state, run);
    } catch (_) {
      // Any unexpected trap settles the run honestly rather than propagating
      // and leaving the run active.
      settleFailed(state, runId, input, "Run pipeline aborted unexpectedly.");
    };
  };

  func truncate(text : Text, limit : Nat) : Text {
    if (text.size() <= limit) { return text };
    Text.fromIter(text.chars().take(limit));
  };

  // ---- Revision + decision flow ----

  public func listRevisions(state : RunState, runId : Types.Id) : [Types.Revision] {
    state.revisions.get(runId) ?? [];
  };

  public func getRevision(state : RunState, runId : Types.Id, revisionNumber : Nat) : ?Types.Revision {
    let revisions = state.revisions.get(runId) ?? [];
    revisions.find(func(r) { r.revisionNumber == revisionNumber });
  };

  // Mark a run's video output as generating and schedule the revision
  // regeneration on a one-shot timer so the caller returns promptly. Returns
  // the run when it exists, `null` otherwise.
  public func beginTweak(
    state : RunState,
    dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>,
    lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>,
    assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>,
    input : Types.TweakInput,
  ) : async ?Types.ProductionRun {
    let run = switch (state.runs.get(input.runId)) {
      case (?r) { r };
      case null { return null };
    };

    // A revision is being generated, so the run's video output is honestly
    // still generating until the new revision resolves. A real attached
    // artifact stays playable and overrides the generating state.
    if (run.mediaArtifact == null) {
      storeRun(state, { run with videoStatus = #generating });
    };

    // Defer the regeneration so the caller is not blocked until it finishes.
    ignore Timer.setTimer<system>(#seconds(0), func() : async () {
      await processTweak(state, dna, lore, assets, input);
    });

    ?run;
  };

  // Settle a run's video status back to its terminal value after a failed
  // regeneration, without trapping.
  func settleTweakFailure(state : RunState, run : Types.ProductionRun) {
    storeRun(state, { run with videoStatus = terminalVideoStatus(run.mediaArtifact) });
  };

  // The deferred continuation of a tweak: regenerates the run's outputs,
  // appends a new revision, and settles the run's video status. Runs in a timer
  // callback, so it must never trap — a failed regeneration settles the video
  // status back to its terminal value instead.
  public func processTweak(
    state : RunState,
    dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>,
    lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>,
    assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>,
    input : Types.TweakInput,
  ) : async () {
    let run = switch (state.runs.get(input.runId)) {
      case (?r) { r };
      case null { return };
    };

    let character = findCharacter(dna, run.characterId);
    // The run does not persist its ingredient ids, so reconstruct the bound
    // set from assets linked to the run's character.
    let bound = switch (run.characterId) {
      case (?cid) {
        assets.values().filter(func(a) {
          switch (a.linkedCharacterId) {
            case (?linked) { linked == cid };
            case null { false };
          };
        }).toArray();
      };
      case null { [] };
    };
    let prompts = buildPrompts(character, lore, bound, run.rawInput, ?input.instruction);

    // Same platform condition as the run pipeline: without inference
    // credentials the regeneration cannot produce a revision, so settle the
    // run's video status back to its terminal value deterministically.
    if (not (await Inference.isAvailable<system>())) {
      settleTweakFailure(state, run);
      return;
    };

    let writerResult = try {
      await* Inference.runChat<system>(prompts.writer);
    } catch (_) {
      settleTweakFailure(state, run);
      return;
    };
    let visualResult = try {
      await* Inference.runChat<system>(prompts.visual);
    } catch (_) {
      settleTweakFailure(state, run);
      return;
    };
    let continuityResult = try {
      await* Inference.runChat<system>(prompts.continuity);
    } catch (_) {
      settleTweakFailure(state, run);
      return;
    };

    let agentOutputs : [Types.AgentOutput] = [
      { agent = #writer; content = writerResult.text },
      { agent = #visual; content = visualResult.text },
      { agent = #continuity; content = continuityResult.text },
    ];
    let formatOutputs = buildFormatOutputs(writerResult.text, visualResult.text);
    let totalBurn = writerResult.tokens + visualResult.tokens + continuityResult.tokens;

    let existing = state.revisions.get(input.runId) ?? [];
    let nextNumber = existing.size() + 1;
    let revision : Types.Revision = {
      revisionNumber = nextNumber;
      instruction = ?input.instruction;
      generatedAssets = agentOutputs;
      formatOutputs;
      tokenCostBurn = totalBurn;
      timestamp = Time.now();
    };
    state.revisions.add(input.runId, existing.concat([revision]));

    // Refresh the run's displayed outputs to the new revision.
    let updated : Types.ProductionRun = {
      id = run.id;
      promptId = run.promptId;
      characterId = run.characterId;
      rawInput = run.rawInput;
      status = run.status;
      generatedAssets = agentOutputs;
      formatOutputs;
      tokenCostBurn = totalBurn;
      timestamp = run.timestamp;
      mediaArtifact = run.mediaArtifact;
      videoStatus = terminalVideoStatus(run.mediaArtifact);
    };
    storeRun(state, updated);
  };

  public func acceptRun(state : RunState, runId : Types.Id, revisionNumber : Nat) : ?Types.ProductionRun {
    let run = switch (state.runs.get(runId)) {
      case (?r) { r };
      case null { return null };
    };
    let updated = updateRunStatus(state, run, #completed);
    state.decisions.add(runId, {
      decision = #approved;
      acceptedRevision = ?revisionNumber;
      rejectionReason = null;
    });
    ?updated;
  };

  public func rejectRun(state : RunState, runId : Types.Id, reason : ?Text) : ?Types.ProductionRun {
    let run = switch (state.runs.get(runId)) {
      case (?r) { r };
      case null { return null };
    };
    let updated = updateRunStatus(state, run, #halted);
    state.decisions.add(runId, {
      decision = #rejected;
      acceptedRevision = null;
      rejectionReason = reason;
    });
    ?updated;
  };

  public func continueRun(state : RunState, runId : Types.Id, revisionNumber : Nat) : ?Types.ProductionRun {
    let run = switch (state.runs.get(runId)) {
      case (?r) { r };
      case null { return null };
    };
    // Continue proceeds with the revision the operator is currently viewing
    // without further changes, so it records a terminal approval of that
    // revision. The frontend treats #approved as decided, which retires the
    // proceed controls.
    state.decisions.add(runId, {
      decision = #approved;
      acceptedRevision = ?revisionNumber;
      rejectionReason = null;
    });
    ?run;
  };

  public func getDecision(state : RunState, runId : Types.Id) : ?Types.RunDecisionState {
    state.decisions.get(runId);
  };

  public func listDecisions(state : RunState) : [(Types.Id, Types.RunDecisionState)] {
    state.decisions.entries().toArray();
  };

  // ---- Real media artifact ----

  // Attach a playable video artifact to a run using only the run and artifact
  // maps. Shared by the user-upload path and the deferred generation path, so
  // both settle the run's `videoStatus` to `#ready` through the same code.
  // Returns the updated run, or `null` if the run does not exist.
  public func attachArtifact(
    runs : Map.Map<Types.Id, Types.ProductionRun>,
    mediaArtifacts : Map.Map<Types.Id, Types.MediaArtifact>,
    input : Types.AttachMediaInput,
  ) : ?Types.ProductionRun {
    let run = switch (runs.get(input.runId)) {
      case (?r) { r };
      case null { return null };
    };
    // The file is already stored (by the frontend via object-storage, or by the
    // generation continuation from the provider's playable output URL), so the
    // artifact is immediately playable.
    let artifact : Types.MediaArtifact = {
      storageUrl = input.storageUrl;
      mimeType = input.mimeType;
      durationSeconds = input.durationSeconds;
      aspectRatio = input.aspectRatio;
      status = #ready;
      characterId = run.characterId;
      cameoId = input.cameoId;
      createdAt = Time.now();
    };
    mediaArtifacts.add(input.runId, artifact);
    let updated : Types.ProductionRun = {
      id = run.id;
      promptId = run.promptId;
      characterId = run.characterId;
      rawInput = run.rawInput;
      status = run.status;
      generatedAssets = run.generatedAssets;
      formatOutputs = run.formatOutputs;
      tokenCostBurn = run.tokenCostBurn;
      timestamp = run.timestamp;
      mediaArtifact = ?artifact;
      // A real attached artifact overrides any generating state.
      videoStatus = #ready;
    };
    runs.add(updated.id, updated);
    ?updated;
  };

  // Attach a user-uploaded video file (already stored via object-storage) to a
  // run as its produced video artifact. Returns the updated run, or `null` if
  // the run does not exist.
  public func attachMediaArtifact(state : RunState, input : Types.AttachMediaInput) : ?Types.ProductionRun {
    attachArtifact(state.runs, state.mediaArtifacts, input);
  };

  // Read back a run's produced video artifact, or `null` when none is attached
  // or the run does not exist. The `mediaArtifacts` map is the authoritative
  // store; the run also mirrors its attached artifact in `mediaArtifact`, so
  // fall back to that mirror when the map has no entry. This keeps the read path
  // consistent with the run record and guarantees a successfully attached video
  // is observable here even if the two stores ever diverge.
  public func getMediaArtifact(state : RunState, runId : Types.Id) : ?Types.MediaArtifact {
    switch (state.mediaArtifacts.get(runId)) {
      case (?artifact) { ?artifact };
      case null {
        switch (state.runs.get(runId)) {
          case (?run) { run.mediaArtifact };
          case null { null };
        };
      };
    };
  };

  // Delete a run's produced video artifact. Removes the artifact from the
  // mediaArtifacts Map and clears the mirrored `mediaArtifact` reference on the
  // run so `getMediaArtifact` returns `null` afterward. Returns `true` when an
  // artifact existed and was removed, `false` when the run has no artifact (or
  // the run does not exist).
  public func deleteMediaArtifact(state : RunState, runId : Types.Id) : Bool {
    let existed = switch (state.mediaArtifacts.get(runId)) {
      case (?_) { true };
      case null { false };
    };
    if (not existed) { return false };
    state.mediaArtifacts.remove(runId);
    // Clear the mirrored reference on the run so `getMediaArtifact` and the
    // run record agree that no artifact remains.
    switch (state.runs.get(runId)) {
      case (?run) {
        let updated : Types.ProductionRun = {
          id = run.id;
          promptId = run.promptId;
          characterId = run.characterId;
          rawInput = run.rawInput;
          status = run.status;
          generatedAssets = run.generatedAssets;
          formatOutputs = run.formatOutputs;
          tokenCostBurn = run.tokenCostBurn;
          timestamp = run.timestamp;
          mediaArtifact = null;
          // Deleting the artifact returns the cut to its honest no-result
          // state without breaking the run.
          videoStatus = #no_result;
        };
        storeRun(state, updated);
      };
      case null {};
    };
    true;
  };
};
