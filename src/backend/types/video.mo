import Common "common";

module {
  public type Id = Common.Id;
  public type Timestamp = Common.Timestamp;

  // ---- Generation models ----

  // A selectable external video-generation model. `premium` marks a model that
  // is offered as an upgrade over the default; `default` marks the model the
  // backend selects when the caller does not choose one.
  public type VideoModel = {
    id : Text;
    name : Text;
    provider : Text;
    premium : Bool;
    default : Bool;
  };

  // ---- Prompt selection ----

  // One selectable prompt/cut for a run, derived from the run's latest revision
  // generated assets. `index` is the stable position used to select the prompt
  // for generation; `agent` names which pipeline agent produced it; `content` is
  // the exact prompt text that would be submitted.
  public type VideoPromptOption = {
    index : Nat;
    agent : Text;
    content : Text;
  };

  // ---- Per-run generation state ----

  // Honest lifecycle of a run's external video generation. `#generating` while
  // the provider is working, `#ready` once a real playable artifact is attached,
  // `#no_result` when the provider finished without a usable video, and
  // `#failed` when the request could not be completed (for example a provider
  // error). `#not_started` is the initial state before any generation request.
  public type VideoGenerationStatus = {
    #not_started;
    #generating;
    #ready;
    #no_result;
    #failed;
  };

  // The generation state of one run. `startedAt` is the wall-clock time the
  // current generation request began, so the UI can show elapsed time while
  // `status` is `#generating`. `promptIndex` is the position of the chosen
  // prompt within the run's prompt options and `prompt` is the exact text
  // submitted, so the UI can show what produced the video and a re-run can
  // reuse it verbatim. `predictionId` is the provider's prediction identifier
  // once the create request has been accepted, so an in-flight generation can
  // be polled and recovered. `error` carries a human-readable reason when
  // `status` is `#failed`.
  public type VideoGeneration = {
    runId : Id;
    modelId : Text;
    status : VideoGenerationStatus;
    startedAt : Timestamp;
    finishedAt : ?Timestamp;
    promptIndex : Nat;
    prompt : Text;
    predictionId : ?Text;
    error : ?Text;
  };

  // ---- Inputs ----

  // Start generation for an accepted run with a chosen model and prompt.
  // `modelId` is optional; when absent the backend uses the default model.
  // `promptIndex` selects which of the run's prompt options to submit; when
  // absent the backend uses the first option. Exactly one prompt is ever sent.
  public type StartVideoGenerationInput = {
    runId : Id;
    modelId : ?Text;
    promptIndex : ?Nat;
  };

  // Re-run generation for a prior run. `modelId` is optional; when absent the
  // backend reuses the prior model. `promptIndex` selects which prompt option to
  // submit; when absent the backend reuses the prior generation's chosen prompt.
  public type RerunVideoGenerationInput = {
    runId : Id;
    modelId : ?Text;
    promptIndex : ?Nat;
  };

  // ---- Token configuration ----

  // Whether an admin-configured Replicate API token is present. The token value
  // itself is never returned.
  public type ReplicateTokenStatus = {
    configured : Bool;
  };
};
