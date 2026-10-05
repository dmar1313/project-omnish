import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import OutCall "mo:caffeineai-http-outcalls/outcall";
import Types "../types/video";
import ProductionTypes "../types/production";
import ProductionLib "../lib/production";

module {
  // The stable state this domain owns. `replicateToken` is the admin-configured
  // provider credential; `generations` is the per-run generation state;
  // `mediaArtifacts` is the production artifact map the generation continuation
  // attaches a finished video into.
  public type VideoState = {
    replicateToken : { var value : ?Text };
    generations : Map.Map<Types.Id, Types.VideoGeneration>;
    mediaArtifacts : Map.Map<ProductionTypes.Id, ProductionTypes.MediaArtifact>;
    // Transient per-run poll attempt counters. Not stable, so it is rebuilt
    // after an upgrade; a lost counter simply restarts polling.
    pollAttempts : Map.Map<Types.Id, Nat>;
    // Transient per-run heartbeat of the active polling chain: the wall-clock
    // time the chain last scheduled a tick. A live chain refreshes this every
    // tick, so a stale (or absent) entry means the chain is dead and a public
    // poll/recover call must restart it. Not stable, so it is rebuilt after an
    // upgrade; an empty map simply restarts polling.
    activeChains : Map.Map<Types.Id, Int>;
  };

  // The Replicate REST endpoints. The create endpoint accepts a `version` field
  // that may be an official model slug (`owner/model`) or a version hash; the
  // get endpoint polls a prediction by id.
  let replicateCreateUrl = "https://api.replicate.com/v1/predictions";
  let replicatePredictionsUrl = "https://api.replicate.com/v1/predictions/";

  // ---- Model catalog ----

  // The selectable generation models, with Kling 3.0 as the default and
  // Veo 3.1 as the premium option. The `id` is the Replicate model slug sent as
  // the prediction `version`.
  let models : [Types.VideoModel] = [
    {
      id = "kwaivgi/kling-v3-video";
      name = "Kling 3.0";
      provider = "Replicate";
      premium = false;
      default = true;
    },
    {
      id = "google/veo-3.1";
      name = "Veo 3.1";
      provider = "Replicate";
      premium = true;
      default = false;
    },
  ];

  public func listModels() : [Types.VideoModel] {
    models;
  };

  // Resolve a requested model id to a catalog entry. `null` when the id is not
  // in the catalog.
  public func findModel(modelId : Text) : ?Types.VideoModel {
    models.find(func(m) { m.id == modelId });
  };

  // The default model id, used when a caller does not choose one.
  public func defaultModelId() : Text {
    switch (models.find(func(m) { m.default })) {
      case (?m) { m.id };
      case null { models[0].id };
    };
  };

  // ---- Prompt selection ----

  func agentText(agent : ProductionTypes.AgentKind) : Text {
    switch (agent) {
      case (#writer) { "writer" };
      case (#visual) { "visual" };
      case (#continuity) { "continuity" };
    };
  };

  // The selectable prompt/cut options for a run, derived from the run's latest
  // revision generated assets. Each option carries its stable index, the agent
  // that produced it, and the exact prompt text. Empty when the run has no
  // generated assets yet.
  public func listRunPrompts(
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
  ) : [Types.VideoPromptOption] {
    let run = switch (runs.get(runId)) {
      case (?r) { r };
      case null { return [] };
    };
    var index = 0;
    run.generatedAssets.map(
      func(asset) {
        let option : Types.VideoPromptOption = {
          index;
          agent = agentText(asset.agent);
          content = asset.content;
        };
        index += 1;
        option;
      }
    );
  };

  // ---- Token configuration ----

  public func getTokenStatus(state : VideoState) : Types.ReplicateTokenStatus {
    { configured = state.replicateToken.value != null };
  };

  public func setToken(state : VideoState, token : Text) : Types.ReplicateTokenStatus {
    state.replicateToken.value := ?token;
    getTokenStatus(state);
  };

  public func clearToken(state : VideoState) : Types.ReplicateTokenStatus {
    state.replicateToken.value := null;
    getTokenStatus(state);
  };

  // ---- Generation ----

  // Resolve the prompt option at `index` for a run, trapping when the run has
  // no prompts or the index is out of range.
  func resolvePrompt(
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    index : Nat,
  ) : Types.VideoPromptOption {
    let options = listRunPrompts(runs, runId);
    if (options.size() == 0) {
      Runtime.trap("Run has no prompts to generate from");
    };
    if (index >= options.size()) {
      Runtime.trap("Prompt index out of range");
    };
    options[index];
  };

  // Persist a generation in the `#generating` state and schedule the deferred
  // Replicate continuation. Returns the persisted generation.
  //
  // When no admin Replicate token is configured the generation is persisted
  // directly as `#failed` with an explicit reason and no continuation is
  // scheduled: the very first response already reports that generation is
  // unavailable, instead of returning `#generating` and leaving the caller to
  // discover the failure by polling.
  func beginGeneration(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    modelId : Text,
    prompt : Types.VideoPromptOption,
    transform : OutCall.Transform,
  ) : async Types.VideoGeneration {
    let token = state.replicateToken.value;
    let generation : Types.VideoGeneration = {
      runId;
      modelId;
      status = switch (token) { case (?_) { #generating }; case null { #failed } };
      startedAt = Time.now();
      finishedAt = switch (token) { case (?_) { null }; case null { ?Time.now() } };
      promptIndex = prompt.index;
      prompt = prompt.content;
      predictionId = null;
      error = switch (token) {
        case (?_) { null };
        case null { ?"No Replicate API token configured" };
      };
    };
    state.generations.add(runId, generation);

    // Each generation gets a fresh poll budget and a fresh chain heartbeat. A
    // prior generation may have left a counter or a stale heartbeat behind (for
    // example when a concurrent poll settled it while a chain tick was
    // scheduled), and inheriting either would settle the new generation as
    // failed after only a few polls or suppress the restart of its chain.
    clearPollState(state, runId);

    // Without a token there is nothing to call, so no continuation is
    // scheduled and the generation stays honestly `#failed`.
    switch (token) {
      case null { return generation };
      case (?_) {};
    };

    // Record the create-phase chain heartbeat before scheduling the deferred
    // provider request. The create request is the first link of the chain, so a
    // public poll/recover call can tell a live create (heartbeat fresh) from a
    // dropped one (heartbeat absent or stale) and restart it instead of waiting
    // out the prediction-id grace window.
    state.activeChains.add(runId, Time.now());

    // Defer the provider request so the caller returns promptly with the
    // generation observable as `#generating`.
    ignore Timer.setTimer<system>(#seconds(0), func() : async () {
      await runGeneration(state, runs, runId, modelId, prompt.content, transform);
    });

    generation;
  };

  // Restart the create phase of a generation whose create continuation was
  // dropped before it recorded a prediction id. Re-schedules `runGeneration`
  // with the generation's persisted model and prompt, so a dropped create is
  // actually recovered rather than only observed. Does nothing when the
  // generation is no longer in flight.
  func restartCreate(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    transform : OutCall.Transform,
  ) : async () {
    if (not isGenerating(state, runId)) { return };
    let generation = switch (state.generations.get(runId)) {
      case (?g) { g };
      case null { return };
    };
    state.activeChains.add(runId, Time.now());
    ignore Timer.setTimer<system>(#seconds(0), func() : async () {
      await runGeneration(state, runs, runId, generation.modelId, generation.prompt, transform);
    });
  };

  // Start generation for an accepted run with a chosen model and prompt.
  // Returns the run's generation state after the request is accepted, or `null`
  // when the run does not exist. Traps when the run is not in a generatable
  // state or the chosen prompt index is out of range.
  public func startGeneration(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    input : Types.StartVideoGenerationInput,
    transform : OutCall.Transform,
  ) : async ?Types.VideoGeneration {
    let run = switch (runs.get(input.runId)) {
      case (?r) { r };
      case null { return null };
    };
    switch (run.status) {
      case (#completed) {};
      case (_) { Runtime.trap("Run is not in a generatable state") };
    };
    let modelId = input.modelId ?? defaultModelId();
    let index = input.promptIndex ?? 0;
    let prompt = resolvePrompt(runs, input.runId, index);
    ?(await beginGeneration(state, runs, input.runId, modelId, prompt, transform));
  };

  // Re-run generation for a prior run. Returns the run's generation state, or
  // `null` when the run does not exist. Traps when no prior generation exists or
  // the chosen prompt index is out of range.
  public func rerunGeneration(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    input : Types.RerunVideoGenerationInput,
    transform : OutCall.Transform,
  ) : async ?Types.VideoGeneration {
    let prior = switch (state.generations.get(input.runId)) {
      case (?g) { g };
      case null { Runtime.trap("No prior generation to re-run") };
    };
    let modelId = input.modelId ?? prior.modelId;
    let index = input.promptIndex ?? prior.promptIndex;
    let prompt = resolvePrompt(runs, input.runId, index);
    ?(await beginGeneration(state, runs, input.runId, modelId, prompt, transform));
  };

  // Read a run's current generation state, or `null` when generation has never
  // been started for the run.
  public func getGeneration(state : VideoState, runId : Types.Id) : ?Types.VideoGeneration {
    state.generations.get(runId);
  };

  // Poll an in-flight generation against the provider and settle it when the
  // prediction has finished. Returns the generation's current state, or `null`
  // when no generation exists for the run. Safe to call repeatedly; a generation
  // already in a terminal state is returned unchanged.
  public func pollGeneration(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    transform : OutCall.Transform,
  ) : async ?Types.VideoGeneration {
    let generation = switch (state.generations.get(runId)) {
      case (?g) { g };
      case null { return null };
    };
    switch (generation.status) {
      case (#generating) {};
      case (_) { return ?generation };
    };
    let predictionId = switch (generation.predictionId) {
      case (?id) { id };
      case null {
        // No prediction id was ever recorded. The create request is the first
        // link of the chain, so its liveness is tracked by the chain heartbeat:
        // a fresh heartbeat means the create is still in flight, and a stale or
        // absent one means the continuation was dropped. Restart the create
        // while the generation is still within its grace window, so a dropped
        // create is actually recovered rather than only observed. Beyond the
        // window the create can never be polled, so settle the generation to a
        // terminal state instead of leaving it stuck `#generating` forever.
        let now = Time.now();
        let createAlive = switch (state.activeChains.get(runId)) {
          case (?last) { now - last < chainStaleNanos };
          case null { false };
        };
        if (not createAlive and now - generation.startedAt < predictionIdGraceNanos) {
          await restartCreate(state, runs, runId, transform);
          return state.generations.get(runId);
        };
        if (now - generation.startedAt < predictionIdGraceNanos) {
          return ?generation;
        };
        settleFailed(state, runId, "Video generation was interrupted before the provider accepted the request");
        return state.generations.get(runId);
      };
    };
    await pollPrediction(state, runs, generation, predictionId, transform);
  };

  // Recover a generation that was started but whose continuation was lost (for
  // example a generation visible on the provider dashboard but not settled in
  // the app). Re-polls the recorded prediction and settles the generation.
  // Returns the generation's current state, or `null` when no generation exists
  // for the run.
  public func recoverGeneration(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    transform : OutCall.Transform,
  ) : async ?Types.VideoGeneration {
    await pollGeneration(state, runs, runId, transform);
  };

  // ---- Provider interaction ----

  // The deferred continuation of a generation: creates the prediction, records
  // its id, then polls until the prediction reaches a terminal state. Runs in a
  // timer callback, so it must never trap — every failure settles the generation
  // to `#failed` instead.
  func runGeneration(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    modelId : Text,
    prompt : Text,
    transform : OutCall.Transform,
  ) : async () {
    // A duplicated or late continuation must not restart work for a generation
    // that has already settled.
    if (not isGenerating(state, runId)) { return };

    // Refresh the create-phase heartbeat: this continuation is the live create
    // link, so a public poll must see it as alive while the request is in
    // flight and only restart it once this heartbeat goes stale.
    state.activeChains.add(runId, Time.now());

    let token = switch (state.replicateToken.value) {
      case (?t) { t };
      case null {
        settleFailed(state, runId, "No Replicate API token configured");
        return;
      };
    };

    let body = buildRequestBody(modelId, prompt);
    // Create the prediction asynchronously: do NOT send `Prefer: wait`.
    // `Prefer: wait` makes Replicate hold the HTTP response until the
    // prediction finishes (up to 60s), but an IC HTTPS outcall is rejected if
    // the server does not respond within 30 seconds. Video models such as Kling
    // 3.0 and Veo 3.1 routinely take minutes, so a waiting create always times
    // out, the retry below issues a fresh request (with a new Idempotency-Key),
    // and the app never records a prediction id to poll. Without `Prefer: wait`
    // the create returns immediately with the prediction id and a
    // `starting`/`processing` status, and the poll chain settles it.
    let responseText = try {
      await OutCall.httpPostRequest(
        replicateCreateUrl,
        [
          { name = "Authorization"; value = "Bearer " # token },
          { name = "Content-Type"; value = "application/json" },
        ],
        body,
        transform,
      );
    } catch (_) {
      // A transient transport failure on the create request must not kill the
      // generation: retry the create on the next tick, bounded by the same poll
      // budget that bounds the poll chain. Only when the budget is exhausted is
      // the generation settled as failed.
      let attempts = state.pollAttempts.get(runId) ?? 0;
      if (attempts >= maxPollAttempts) {
        clearPollState(state, runId);
        settleFailed(state, runId, "Replicate request failed");
        return;
      };
      state.pollAttempts.add(runId, attempts + 1);
      await restartCreate(state, runs, runId, transform);
      return;
    };

    // The create request returned, so refresh the heartbeat before recording the
    // prediction id and handing off to the poll chain.
    state.activeChains.add(runId, Time.now());

    let predictionId = jsonStringField(responseText, "id");
    let status = jsonStringField(responseText, "status");

    // Record the prediction id as soon as the create request is accepted, so an
    // in-flight generation can be polled and recovered even if this continuation
    // is interrupted.
    switch (predictionId) {
      case (?id) { recordPredictionId(state, runId, id) };
      case null {};
    };

    switch (status) {
      case (?s) {
        if (isTerminalStatus(s)) {
          settleFromResponse(state, runs, runId, responseText, s);
          return;
        };
      };
      case null {};
    };

    // The prediction is still starting/processing. Poll it until it settles.
    switch (predictionId) {
      case (?id) {
        await pollUntilTerminal(state, runs, runId, id, token, transform);
      };
      case null {
        // Surface the provider's own error text (for example a rejected model
        // slug or an invalid token) instead of a generic message.
        let reason = jsonErrorText(responseText) ?? "Replicate did not return a prediction id";
        settleFailed(state, runId, reason);
      };
    };
  };

  // The maximum number of provider polls before a generation is settled as
  // failed. Each poll is one second apart, so this bounds a generation to about
  // ten minutes of polling. Video models such as Kling 3.0 and Veo 3.1 routinely
  // take several minutes to render, so the budget must comfortably exceed a
  // normal render or a legitimate generation would be failed as "did not finish
  // in time".
  let maxPollAttempts : Nat = 600;

  // How long a chain heartbeat may go unrefreshed before the chain is treated
  // as dead. A live chain refreshes it every tick (about one second apart, plus
  // at most one outcall timeout), so a heartbeat older than this means the
  // continuation was dropped and a public poll/recover call must restart it.
  let chainStaleNanos : Int = 60_000_000_000;

  // How long after a generation starts a missing prediction id is still treated
  // as "the create request may be in flight". Beyond this window a generation
  // with no recorded prediction id can never be polled, so a public poll/recover
  // settles it to `#failed` rather than leaving it stuck `#generating`.
  let predictionIdGraceNanos : Int = 120_000_000_000;

  // Clear a run's transient poll bookkeeping: the attempt counter and the chain
  // heartbeat. Called whenever a chain stops (terminal, budget exhausted, or
  // generation no longer in flight) and when a new generation begins.
  func clearPollState(state : VideoState, runId : Types.Id) {
    state.pollAttempts.remove(runId);
    state.activeChains.remove(runId);
  };

  // Schedule the next poll tick of a chain and refresh its heartbeat. Does
  // nothing when the generation is no longer in flight, so a late continuation
  // cannot resurrect a settled generation.
  func scheduleNextPoll(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    predictionId : Text,
    token : Text,
    transform : OutCall.Transform,
  ) : async () {
    if (not isGenerating(state, runId)) {
      clearPollState(state, runId);
      return;
    };
    state.activeChains.add(runId, Time.now());
    ignore Timer.setTimer<system>(#seconds(1), func() : async () {
      await pollUntilTerminal(state, runs, runId, predictionId, token, transform);
    });
  };

  // Ensure a polling chain is running for an in-flight generation. Starts one
  // when no chain is active or the recorded heartbeat is stale, so a generation
  // whose continuation was dropped is actually recovered to a terminal state
  // rather than only observed once. A live chain is left alone, so a public poll
  // cannot spawn a duplicate chain.
  func ensureChain(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    predictionId : Text,
    token : Text,
    transform : OutCall.Transform,
  ) : async () {
    if (not isGenerating(state, runId)) { return };
    let now = Time.now();
    let active = switch (state.activeChains.get(runId)) {
      case (?last) { now - last < chainStaleNanos };
      case null { false };
    };
    if (active) { return };
    state.activeChains.add(runId, now);
    ignore Timer.setTimer<system>(#seconds(1), func() : async () {
      await pollUntilTerminal(state, runs, runId, predictionId, token, transform);
    });
  };

  // Poll a prediction by id until it reaches a terminal state, then settle the
  // generation. Each poll is a separate one-shot timer continuation so no single
  // continuation blocks. Never traps.
  func pollUntilTerminal(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    predictionId : Text,
    token : Text,
    transform : OutCall.Transform,
  ) : async () {
    // A duplicated or late continuation must not re-poll a generation that has
    // already settled to a terminal state.
    if (not isGenerating(state, runId)) {
      clearPollState(state, runId);
      return;
    };

    let attempts = state.pollAttempts.get(runId) ?? 0;
    if (attempts >= maxPollAttempts) {
      clearPollState(state, runId);
      settleFailed(state, runId, "Replicate prediction did not finish in time");
      return;
    };
    state.pollAttempts.add(runId, attempts + 1);
    state.activeChains.add(runId, Time.now());

    let responseText = try {
      await OutCall.httpGetRequest(
        replicatePredictionsUrl # predictionId,
        [{ name = "Authorization"; value = "Bearer " # token }],
        transform,
      );
    } catch (_) {
      // A transient transport failure must not kill the generation: keep the
      // chain alive and retry on the next tick, bounded by the poll budget.
      await scheduleNextPoll(state, runs, runId, predictionId, token, transform);
      return;
    };

    let status = jsonStringField(responseText, "status");
    switch (status) {
      case (?s) {
        if (isTerminalStatus(s)) {
          clearPollState(state, runId);
          settleFromResponse(state, runs, runId, responseText, s);
          return;
        };
      };
      case null {};
    };

    // Still in flight: schedule the next poll on a one-shot timer.
    await scheduleNextPoll(state, runs, runId, predictionId, token, transform);
  };

  // Poll a stored prediction once and settle the generation if it has finished.
  // Used by the public poll/recover paths.
  func pollPrediction(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    generation : Types.VideoGeneration,
    predictionId : Text,
    transform : OutCall.Transform,
  ) : async ?Types.VideoGeneration {
    let token = switch (state.replicateToken.value) {
      case (?t) { t };
      case null {
        settleFailed(state, generation.runId, "No Replicate API token configured");
        return state.generations.get(generation.runId);
      };
    };

    let responseText = try {
      await OutCall.httpGetRequest(
        replicatePredictionsUrl # predictionId,
        [{ name = "Authorization"; value = "Bearer " # token }],
        transform,
      );
    } catch (_) {
      // A transient transport failure must not kill the generation. Ensure a
      // chain is running so the prediction is retried to a terminal state.
      await ensureChain(state, runs, generation.runId, predictionId, token, transform);
      return state.generations.get(generation.runId);
    };

    let status = jsonStringField(responseText, "status");
    switch (status) {
      case (?s) {
        if (isTerminalStatus(s)) {
          clearPollState(state, generation.runId);
          settleFromResponse(state, runs, generation.runId, responseText, s);
          return state.generations.get(generation.runId);
        };
      };
      case null {};
    };

    // Still in flight. Ensure a polling chain is running so a generation whose
    // original continuation was lost is actually recovered to a terminal state
    // rather than only observed once. A live chain is left alone.
    await ensureChain(state, runs, generation.runId, predictionId, token, transform);
    state.generations.get(generation.runId);
  };

  // ---- Settlement ----

  func isTerminalStatus(status : Text) : Bool {
    status == "succeeded" or status == "failed" or status == "canceled" or status == "aborted";
  };

  // Whether a run's generation is still in flight. Settlement is only applied
  // while this is true, so a duplicated or late continuation cannot overwrite a
  // generation that has already reached a terminal state.
  func isGenerating(state : VideoState, runId : Types.Id) : Bool {
    switch (state.generations.get(runId)) {
      case (?g) {
        switch (g.status) { case (#generating) { true }; case (_) { false } };
      };
      case null { false };
    };
  };

  // Settle a generation from a terminal prediction response. On success the
  // output URL is attached to the run through the shared production path; on
  // failure the provider error is recorded.
  func settleFromResponse(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    responseText : Text,
    status : Text,
  ) {
    if (status == "succeeded") {
      switch (jsonOutputUrl(responseText)) {
        case (?url) {
          // Only report the generation as `#ready` once the provider URL has
          // actually been attached to the run. If the run is missing the
          // attachment does nothing, and marking the generation ready would
          // leave the UI showing a ready video that `getMediaArtifact` cannot
          // return.
          if (attachVideo(state, runs, runId, url, responseText)) {
            settleReady(state, runId);
          } else {
            settleFailed(state, runId, "Could not attach the generated video to the run");
          };
        };
        case null {
          settleNoResult(state, runId);
        };
      };
    } else {
      let reason = jsonErrorText(responseText) ?? ("Replicate prediction " # status);
      settleFailed(state, runId, reason);
    };
  };

  // Attach the provider's playable output URL to the run as its media artifact.
  // Writes through the shared production artifact map (`state.mediaArtifacts`),
  // which is the same map `getMediaArtifact` reads, and mirrors the artifact on
  // the run record. The artifact's duration and aspect ratio are populated from
  // the provider response when it carries them; otherwise the honest fallback
  // (0.0 / "") is kept. Returns `true` when the artifact was attached, `false`
  // when the run does not exist.
  func attachVideo(
    state : VideoState,
    runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>,
    runId : Types.Id,
    url : Text,
    responseText : Text,
  ) : Bool {
    let durationSeconds = jsonNumberField(responseText, "duration") ?? 0.0;
    let aspectRatio = jsonStringField(responseText, "aspect_ratio") ?? "";
    switch (ProductionLib.attachArtifact(
      runs,
      state.mediaArtifacts,
      {
        runId;
        storageUrl = url;
        mimeType = "video/mp4";
        durationSeconds;
        aspectRatio;
        cameoId = null;
      },
    )) {
      case (?_) { true };
      case null { false };
    };
  };

  func recordPredictionId(state : VideoState, runId : Types.Id, predictionId : Text) {
    switch (state.generations.get(runId)) {
      case (?g) { state.generations.add(runId, { g with predictionId = ?predictionId }) };
      case null {};
    };
  };

  func settleReady(state : VideoState, runId : Types.Id) {
    if (not isGenerating(state, runId)) { return };
    switch (state.generations.get(runId)) {
      case (?g) {
        state.generations.add(runId, {
          g with
          status = #ready;
          finishedAt = ?Time.now();
          error = null;
        });
      };
      case null {};
    };
  };

  func settleNoResult(state : VideoState, runId : Types.Id) {
    if (not isGenerating(state, runId)) { return };
    switch (state.generations.get(runId)) {
      case (?g) {
        state.generations.add(runId, {
          g with
          status = #no_result;
          finishedAt = ?Time.now();
          error = null;
        });
      };
      case null {};
    };
  };

  func settleFailed(state : VideoState, runId : Types.Id, reason : Text) {
    if (not isGenerating(state, runId)) { return };
    switch (state.generations.get(runId)) {
      case (?g) {
        state.generations.add(runId, {
          g with
          status = #failed;
          finishedAt = ?Time.now();
          error = ?reason;
        });
      };
      case null {};
    };
  };

  // ---- Request / response JSON ----

  // Escape a text value for embedding in a JSON string literal.
  func jsonEscape(text : Text) : Text {
    var out = "";
    for (c in text.toIter()) {
      if (c == '\"') { out #= "\\\"" }
      else if (c == '\\') { out #= "\\\\" }
      else if (c == '\n') { out #= "\\n" }
      else if (c == '\r') { out #= "\\r" }
      else if (c == '\t') { out #= "\\t" }
      else { out #= Text.fromArray([c]) };
    };
    out;
  };

  // Build the create-prediction request body. The model slug is sent as
  // `version`, which Replicate accepts for official models (`owner/model`) and
  // for version hashes.
  func buildRequestBody(modelId : Text, prompt : Text) : Text {
    "{\"version\":\"" # jsonEscape(modelId) # "\",\"input\":{\"prompt\":\"" # jsonEscape(prompt) # "\"}}";
  };

  // The index just past the closing quote of the JSON string literal whose body
  // starts at `start` (just after the opening quote). Returns `size` when the
  // string is unterminated.
  func stringEnd(chars : [Char], start : Nat) : Nat {
    var i = start;
    let size = chars.size();
    while (i < size) {
      let c = chars[i];
      if (c == '\\') { i += 2 }
      else if (c == '\"') { return i + 1 }
      else { i += 1 };
    };
    size;
  };

  // The index just past the JSON value starting at `start`, skipping over a
  // string, a nested array/object, or a scalar. Used to walk a JSON object's
  // members without descending into nested values.
  func skipJsonValue(chars : [Char], start : Nat) : Nat {
    let size = chars.size();
    var i = start;
    if (i >= size) { return i };
    let c = chars[i];
    if (c == '\"') { return stringEnd(chars, i + 1) };
    if (c == '{' or c == '[') {
      let open = c;
      let close = if (c == '{') { '}' } else { ']' };
      var depth = 0;
      var inString = false;
      while (i < size) {
        let ch = chars[i];
        if (inString) {
          if (ch == '\\') { i += 2 } else {
            if (ch == '\"') { inString := false };
            i += 1;
          };
        } else {
          if (ch == '\"') { inString := true; i += 1 }
          else if (ch == open) { depth += 1; i += 1 }
          else if (ch == close) {
            depth -= 1;
            i += 1;
            if (depth == 0) { return i };
          } else { i += 1 };
        };
      };
      return size;
    };
    // A scalar (number, true, false, null): end at the next delimiter.
    while (i < size) {
      let ch = chars[i];
      if (ch == ',' or ch == '}' or ch == ']' or ch == ' ' or ch == '\n' or ch == '\r' or ch == '\t') {
        return i;
      };
      i += 1;
    };
    size;
  };

  // The index of the value of a **top-level** field in a JSON object, or `null`
  // when the field is absent. Nested objects and arrays are skipped whole, so a
  // same-named field inside `input`, `output`, or `urls` is never matched. This
  // is what makes the top-level `status`, `error`, and `id` fields reliable.
  func topLevelValueStart(chars : [Char], field : Text) : ?Nat {
    let size = chars.size();
    var i = skipWhitespace(chars, 0);
    if (i >= size or chars[i] != '{') { return null };
    i += 1;
    while (i < size) {
      i := skipWhitespace(chars, i);
      if (i >= size) { return null };
      let c = chars[i];
      if (c == '}') { return null };
      if (c == ',') { i += 1; continue };
      if (c != '\"') { return null };
      let keyStart = i + 1;
      let keyEnd = stringEnd(chars, keyStart);
      let key = Text.fromArray(chars.sliceToArray(keyStart, keyEnd - 1));
      i := skipWhitespace(chars, keyEnd);
      if (i >= size or chars[i] != ':') { return null };
      i := skipWhitespace(chars, i + 1);
      if (i >= size) { return null };
      if (key == field) { return ?i };
      i := skipJsonValue(chars, i);
    };
    null;
  };

  // Find the value of a **top-level** string field in a JSON object. Returns
  // `null` when the field is absent or not a string. Nested same-named fields
  // are ignored, so the top-level prediction `status`/`error`/`id` are read
  // correctly even when the response contains nested objects with those names.
  func jsonStringField(json : Text, field : Text) : ?Text {
    let chars = json.toArray();
    let start = switch (topLevelValueStart(chars, field)) {
      case (?s) { s };
      case null { return null };
    };
    if (start >= chars.size() or chars[start] != '\"') { return null };
    readJsonString(chars, start + 1);
  };

  // Find the value of a **top-level** numeric field in a JSON object. Returns
  // `null` when the field is absent or not a number. Used to read an optional
  // provider-reported video duration; a missing or non-numeric field leaves the
  // caller's honest fallback in place.
  func jsonNumberField(json : Text, field : Text) : ?Float {
    let chars = json.toArray();
    let start = switch (topLevelValueStart(chars, field)) {
      case (?s) { s };
      case null { return null };
    };
    if (start >= chars.size()) { return null };
    let c = chars[start];
    if (not (c == '-' or (c.toNat32() >= 48 and c.toNat32() <= 57))) { return null };
    let end = valueEnd(chars, start);
    let token = Text.fromArray(chars.sliceToArray(start.toInt(), end.toInt()))
      .trim(#predicate(func(ch) { ch == ' ' or ch == '\n' or ch == '\r' or ch == '\t' }));
    switch (Int.fromText(token)) {
      case (?n) { ?n.toFloat() };
      case null { null };
    };
  };

  // Find a string field nested one level inside a **top-level** object field.
  // Used to read Replicate's object-shaped `error` (`{"detail": "..."}` or
  // `{"message": "..."}`). Returns `null` when the outer field is absent, is not
  // an object, or does not contain the inner string field.
  func jsonNestedStringField(json : Text, outer : Text, inner : Text) : ?Text {
    let chars = json.toArray();
    let start = switch (topLevelValueStart(chars, outer)) {
      case (?s) { s };
      case null { return null };
    };
    if (start >= chars.size() or chars[start] != '{') { return null };
    let end = valueEnd(chars, start);
    var i = start + 1;
    while (i < end) {
      i := skipWhitespace(chars, i);
      if (i >= end) { return null };
      let c = chars[i];
      if (c == '}') { return null };
      if (c == ',') { i += 1; continue };
      if (c != '\"') { return null };
      let keyStart = i + 1;
      let keyEnd = stringEnd(chars, keyStart);
      let key = Text.fromArray(chars.sliceToArray(keyStart, keyEnd - 1));
      i := skipWhitespace(chars, keyEnd);
      if (i >= end or chars[i] != ':') { return null };
      i := skipWhitespace(chars, i + 1);
      if (i >= end) { return null };
      if (key == inner) {
        if (chars[i] != '\"') { return null };
        return readJsonString(chars, i + 1);
      };
      i := skipJsonValue(chars, i);
    };
    null;
  };

  // Extract the provider's human-readable error text from a prediction or
  // create response. Replicate reports errors as a top-level string `error`, a
  // top-level `detail` string (validation errors), or an object `error` with a
  // nested `detail`/`message`. Returns `null` when no error text is present.
  func jsonErrorText(json : Text) : ?Text {
    switch (jsonStringField(json, "error")) {
      case (?e) { if (e.size() > 0) { return ?e } };
      case null {};
    };
    switch (jsonStringField(json, "detail")) {
      case (?d) { if (d.size() > 0) { return ?d } };
      case null {};
    };
    switch (jsonNestedStringField(json, "error", "detail")) {
      case (?d) { if (d.size() > 0) { return ?d } };
      case null {};
    };
    switch (jsonNestedStringField(json, "error", "message")) {
      case (?m) { if (m.size() > 0) { return ?m } };
      case null {};
    };
    null;
  };

  // Extract the first playable output URL from a prediction response. Replicate
  // returns `output` as a string, an array of strings, or a nested object, so
  // this scans the **top-level** output value for the first `http` URL. A `null`
  // output (or an output with no URL) yields `null`; the scan is bounded to the
  // output value so it never picks up a URL from a sibling field such as `urls`.
  func jsonOutputUrl(json : Text) : ?Text {
    let chars = json.toArray();
    let start = switch (topLevelValueStart(chars, "output")) {
      case (?s) { s };
      case null { return null };
    };
    if (start >= chars.size()) { return null };
    let c = chars[start];
    if (c == 'n') { return null }; // output is null
    if (c == '\"') {
      // A bare string output: read it and accept it only if it is a URL.
      let value = readJsonString(chars, start + 1);
      switch (value) {
        case (?v) { if (isHttpUrl(v)) { return ?v } else { return null } };
        case null { return null };
      };
    };
    // An array or object output: scan within its bounds for the first URL.
    let end = valueEnd(chars, start);
    findUrl(chars, start, end);
  };

  // The index just past the JSON value starting at `start` (its matching close
  // bracket for an array/object, or the next top-level delimiter otherwise).
  func valueEnd(chars : [Char], start : Nat) : Nat {
    let size = chars.size();
    let open = chars[start];
    if (open == '[' or open == '{') {
      let close = if (open == '[') { ']' } else { '}' };
      var depth = 0;
      var i = start;
      var inString = false;
      while (i < size) {
        let c = chars[i];
        if (inString) {
          if (c == '\\') { i += 2 } else {
            if (c == '\"') { inString := false };
            i += 1;
          };
        } else {
          if (c == '\"') { inString := true; i += 1 }
          else if (c == open) { depth += 1; i += 1 }
          else if (c == close) {
            depth -= 1;
            i += 1;
            if (depth == 0) { return i };
          } else { i += 1 };
        };
      };
      size;
    } else {
      // A scalar: end at the next top-level comma or closing brace.
      var i = start;
      while (i < size) {
        let c = chars[i];
        if (c == ',' or c == '}' or c == ']') { return i };
        i += 1;
      };
      size;
    };
  };

  func isHttpUrl(value : Text) : Bool {
    value.startsWith(#text "http://") or value.startsWith(#text "https://");
  };

  // Scan forward from `from` up to `end` for the first `http` URL. Returns the
  // URL text.
  func findUrl(chars : [Char], from : Nat, end : Nat) : ?Text {
    var i = from;
    while (i + 4 <= end) {
      if (chars[i] == 'h' and chars[i + 1] == 't' and chars[i + 2] == 't' and chars[i + 3] == 'p') {
        return readUrl(chars, i);
      };
      i += 1;
    };
    null;
  };

  // Read a URL starting at `start` until a JSON delimiter or whitespace.
  func readUrl(chars : [Char], start : Nat) : ?Text {
    var i = start;
    let size = chars.size();
    while (i < size) {
      let c = chars[i];
      if (c == '\"' or c == '\\' or c == ' ' or c == '\n' or c == '\r' or c == '\t' or c == ',' or c == '}' or c == ']') {
        break;
      };
      i += 1;
    };
    if (i == start) { return null };
    ?Text.fromArray(chars.sliceToArray(start.toInt(), i.toInt()));
  };

  // Read a JSON string literal body starting just after the opening quote.
  func readJsonString(chars : [Char], start : Nat) : ?Text {
    var i = start;
    let size = chars.size();
    var out = "";
    while (i < size) {
      let c = chars[i];
      if (c == '\"') { return ?out };
      if (c == '\\' and i + 1 < size) {
        let next = chars[i + 1];
        if (next == 'n') { out #= "\n" }
        else if (next == 't') { out #= "\t" }
        else if (next == 'r') { out #= "\r" }
        else if (next == '\"') { out #= "\"" }
        else if (next == '\\') { out #= "\\" }
        else if (next == '/') { out #= "/" }
        else { out #= Text.fromArray([next]) };
        i += 2;
      } else {
        out #= Text.fromArray([c]);
        i += 1;
      };
    };
    null;
  };

  func skipWhitespace(chars : [Char], start : Nat) : Nat {
    var i = start;
    let size = chars.size();
    while (i < size) {
      let c = chars[i];
      if (c == ' ' or c == '\n' or c == '\r' or c == '\t') { i += 1 } else { break };
    };
    i;
  };
};
