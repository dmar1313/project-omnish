mixin () {
  public query func getApiDoc() : async Text {
    "
# Project Omnish — Backend API

Project Omnish is a multi-agent production studio. The backend owns the Prompt DNA
Registry, World Lore rules, Asset Ingredients, the simulation/production pipeline,
the Super Suit optimization sandbox, and cost telemetry. It also exposes its
persisted data to the Caffeine Data Intelligence agent through OQL.

## Authentication and identity

Every domain method requires a **signed-in (non-anonymous) caller**. There is no
anonymous read path for domain data.

The app's frontend pins an Internet Identity **derivation origin**, published at
`/.well-known/ii-derivation-origin` when available. An agent that already holds
the user's Internet Identity authorization derives the correct per-app principal
against that origin (for example `icp identity link web <name> --app <host>`).
Such a delegation acts with the user's full authority in this app until it
expires.

### Registration prerequisite

A principal is only known to the backend after it registers. Registration happens
when a caller signs in through the app's own frontend, which calls
`_internet_identity_sign_in_finish` (or `_initialize_access_control`) once. A
direct API caller must therefore call `_initialize_access_control` once as a
signed-in caller before any role-guarded call, including guarded queries.

- The **first** principal to initialize becomes `#admin`; every subsequent
  principal becomes `#user`.
- An **anonymous** caller is never registered (`initialize` returns early) and is
  treated as `#guest`.
- An **unregistered** signed-in caller hits `Runtime.trap(\"User is not registered\")`
  on any guarded endpoint, because `getUserRole` traps for a principal with no
  role. This includes a principal that belongs to the app's owner but never signed
  in through the frontend, and a signed-in caller derived against a different
  origin (a different principal than the one the frontend registered).

Role helpers: `getCallerUserRole()`, `isCallerAdmin()`, `assignCallerUserRole(user, role)`
(admin-only; traps `\"Unauthorized: Only admins can assign user roles\"` otherwise).

## Authorization boundaries

- **Studio (DNA / Lore / Assets)**, **Cameo Capture**, and **Production**
  endpoints require role `#user` or `#admin`. A caller without permission traps
  `\"Unauthorized: Only signed-in users can perform this action\"`.
- **Optimization Gate** endpoints require `#admin`. A non-admin traps
  `\"Unauthorized: Only admins can perform this action\"`.
- **OQL** (`schema`, `execute`) is authorized per entity; all entities are
  `controllerOnly`, so only the platform controller (the Data Intelligence agent)
  reads them. End users do not read OQL directly. The exposed entities are
  `dnaRecord`, `loreRule`, `assetIngredient`, `productionRun`, `simulationLog`,
  `superSuitPatch`, `cameoCapture`, `runRevision`, `runDecision`, `mediaArtifact`,
  `agentVersion`, and `videoGeneration`. The admin-configured Replicate API token
  is a secret and is deliberately **not** exposed as a queryable entity.

## Units and encoding

- `Id` is `Nat`, assigned by a monotonic per-collection counter starting at 0.
- `Timestamp` is `Int`, nanoseconds since the Unix epoch (`Time.now()`).
- `tokenCostBurn` is `Float`, the sum of tokens reported by the three inference
  calls for a run.
- `AssetKind` is `#image | #video | #audio`; `LoreStatus` is `#active | #deprecated`;
  `RunStatus` is `#pending | #running | #completed | #halted | #failed`;
  `PatchStatus` is `#pending_approval | #rejected | #approved`;
  `AgentKind` is `#writer | #visual | #continuity`.
- Optional fields (`?Id`) are encoded as Candid `opt`; absent means `null`.
- `identityBlocks`, `visualMarkers`, `immutableTraits`, `timelineConstraints`,
  `universeBounds`, and `performanceDeltaMetrics` are free-form `Text` (the UI
  stores JSON or delimited text in them; the backend treats them as opaque text).

## Studio API

Prompt DNA Registry:
- `listDna() : [DnaRecord]` (query)
- `getDna(id) : ?DnaRecord` (query)
- `createDna(input) : DnaRecord` — assigns a new id, `activeVersion = 1`.
- `updateDna(id, input) : ?DnaRecord` — replaces content, preserves `activeVersion`
  and `createdAt`; returns `null` if the id does not exist.
- `deleteDna(id) : Bool` — `true` if removed, `false` if absent.
- `bumpDnaVersion(id) : ?DnaRecord` — increments `activeVersion`; `null` if absent.

World Lore:
- `listLore() : [LoreRule]` (query)
- `getLore(id) : ?LoreRule` (query)
- `createLore(input) : LoreRule` — new rule starts `#active`.
- `updateLore(id, input) : ?LoreRule` — preserves `status` and `createdAt`.
- `setLoreStatus(id, status) : ?LoreRule`
- `deleteLore(id) : Bool`

Asset Ingredients:
- `listAssets() : [AssetIngredient]` (query)
- `getAsset(id) : ?AssetIngredient` (query)
- `createAsset(input) : AssetIngredient`
- `updateAsset(id, input) : ?AssetIngredient` — preserves `createdAt`.
- `deleteAsset(id) : Bool`
- `listAssetsForCharacter(characterId) : [AssetIngredient]` (query) — assets whose
  `linkedCharacterId` equals `characterId`.

## Cameo Capture API

Character creation supports three input methods: a text description (the DNA
fields above), reference image uploads (Asset Ingredients linked to the
character), and a guided camera cameo. A cameo session records the three guided
photo captures and the voice sample for one character.

- `listCameos() : [CameoCapture]` (query)
- `getCameo(id) : ?CameoCapture` (query)
- `createCameo(input : CameoInput) : CameoCapture` — allocates a new id. The
  session starts `#draft` unless all three photos and the voice sample are
  supplied, in which case it starts `#complete`.
- `updateCameo(id, input) : ?CameoCapture` — replaces the capture slots and
  recomputes `status`; preserves `createdAt`. Returns `null` if the id does not
  exist.
- `deleteCameo(id) : Bool` — `true` if removed, `false` if absent.
- `listCameosForCharacter(characterId) : [CameoCapture]` (query) — sessions whose
  `characterId` equals `characterId`.

`CameoInput` is
`{ characterId : Id; frontAssetId : ?Id; leftAssetId : ?Id; rightAssetId : ?Id;
voiceAssetId : ?Id }`. Each asset id references an `AssetIngredient` row; the
backend stores references only and never generates or synthesizes media from the
captured photos or voice sample. `CameoStatus` is `#draft | #complete`; a session
is `#complete` only when all four asset ids are present.

## Production API

- `startProductionRun(input : RunInput) : ProductionRun` — allocates a run,
  persists it as `#running` with `videoStatus = #generating`, then drives the
  pipeline to its terminal state **inline** and returns the settled run. The run
  is persisted before the first inference call, so a caller that polls
  `getRun(id)` / `listSimulationLogs(runId)` while the call is in flight observes
  the `#running` state and the incrementally written stage logs; the call itself
  resolves once the run has settled to `#completed`, `#halted`, or `#failed`.
  `RunInput` is
  `{ rawInput : Text; characterId : ?Id; assetIngredientIds : [Id] }`. The
  pipeline never leaves a run `#running`: every path reaches a terminal state
  before the call returns.
- `listRuns() : [RunSummary]` (query)
- `getRun(id) : ?ProductionRun` (query)
- `listSimulationLogs(runId) : [SimulationLog]` (query) — logs for one run, in
  insertion order.
- `getCostTelemetry() : CostTelemetry` (query) — `{ totalRuns; totalTokenCostBurn;
  averageCostPerRun }`; average is `0.0` when there are no runs.

### Pipeline lifecycle

`startProductionRun` first persists the run with `status = #running` and
`videoStatus = #generating`, then performs the following steps inline, appending
a `SimulationLog` row for each as that stage completes. Because the run is
persisted before the first inference call, the `#running` state and the
incremental stage logs are observable to concurrent queries while the call is
still in flight:

1. `ingestion` — records the raw input and staged asset count.
2. `asset_binding` — resolves `assetIngredientIds` against stored assets; unknown
   ids are silently skipped.
3. `dna_crossref` — resolves `characterId` against the DNA registry (absent or
   unknown id means \"no character\").
4. `lore_check` — **blocking validation**. If the raw input conflicts with an
   active lore rule (mentions the rule name or a constraint token) or negates an
   immutable trait (`not`/`no`/`without`/`remove`/`change`/`alter` + trait), the
   run is stored with `status = #halted`, `generatedAssets = []`,
   `formatOutputs = []`, `tokenCostBurn = 0.0`, and returned immediately. No
   inference is called.
5. `fracture` — splits the idea into writer / visual / continuity sub-prompts.

If validation passes, the backend makes **three sequential inference outcalls**
(writer, visual, continuity), appending a `fracture` log after each agent
completes. On success the run is stored with `status = #completed`,
`generatedAssets` holds one `AgentOutput` per agent, and `formatOutputs` holds
three platform adaptations (`vertical_video` 9:16 limit 2200, `social_post` 1:1
limit 280, `long_form` 16:9 limit 5000). `tokenCostBurn` is the sum of the three
calls' token counts.

If the inference capability is unavailable in the environment (no
`CAFFEINE_INFERENCE_API_KEY` provisioned), the pipeline detects that before
calling and stores the run with `status = #failed`, recording the reason in a
`fracture` log. If an inference call itself fails, the run is likewise stored
with `status = #failed` and a `fracture` log records the failure. Neither case
traps the `startProductionRun` call: the run settles to `#failed` and the call
returns that settled run.

### Polling

`startProductionRun` persists the run in `#running` / `#generating` before the
first inference call and drives the pipeline inline, settling the run to a
terminal state (`#completed`, `#halted`, or `#failed`) before the call returns.
A caller that polls `getRun(runId)` (or `listSimulationLogs(runId)`) while the
call is in flight observes the `#running` state and the incrementally appended
stage logs; the call's return value is the settled run. Each stage log is
appended incrementally, so a run in flight shows a growing log list; a completed
run has all five stage logs. `#pending` is defined in the type but is not
produced by the current pipeline.

### Revision and decision flow

A completed run can be revised with natural-language tweaks and then accepted,
rejected, or continued. Each revision is immutable and numbered from 1; revision
1 is the original generation (`instruction = null`).

- `listRevisions(runId) : [Revision]` (query) — every revision of a run in
  ascending `revisionNumber` order; empty for an unknown run.
- `getRevision(runId, revisionNumber) : ?Revision` (query) — one revision, or
  `null` if the run or revision does not exist.
- `submitTweak(input : TweakInput) : ?Revision` — sets the run's `videoStatus` to
  `#generating` (unless an artifact is already attached) and **returns promptly**
  with `null`; the regeneration then continues in the background and appends a
  new revision when it finishes. `TweakInput` is
  `{ runId : Id; instruction : Text }`. The return value is always `null` because
  no revision exists yet — poll `listRevisions(runId)` to observe the new
  revision. If the run does not exist, no work is scheduled. If any of the three
  inference calls fails, no revision is appended and the run's `videoStatus`
  settles back to its terminal value (`#ready`/`#no_result`); the previously
  displayed revision remains. This is an update call that spends inference
  tokens; it is **not** idempotent.
- `acceptRun(runId, revisionNumber) : ?ProductionRun` — marks the run approved
  and records `acceptedRevision`. `null` if the run does not exist.
- `rejectRun(runId, reason : ?Text) : ?ProductionRun` — marks the run rejected
  with an optional short reason. `null` if the run does not exist.
- `continueRun(runId, revisionNumber) : ?ProductionRun` — proceeds with the
  revision the operator is currently viewing (`revisionNumber`) without further
  changes, recording it as the accepted revision. `null` if the run does not
  exist.
- `getRunDecision(runId) : ?RunDecisionState` (query) — the run's decision,
  accepted revision, and rejection reason.
- `listRunDecisions() : [(Id, RunDecisionState)]` (query) — decisions for every
  run, so a run list can show approved/rejected status.

`RunDecision` is `#in_progress | #completed | #approved | #rejected`.
`RunDecisionState` is `{ decision : RunDecision; acceptedRevision : ?Nat;
rejectionReason : ?Text }`. A run with no recorded decision is reported as
`#in_progress` while its `RunStatus` is `#pending`/`#running`, and `#completed`
once generation finishes.

### Real media artifact

The platform cannot synthesize photorealistic cameo video. A run's video output
is therefore a **reference to a real, playable video file the user uploaded**,
stored via platform file storage. The backend stores only the URL and metadata,
never raw bytes.

- `attachMediaArtifact(input : AttachMediaInput) : ?ProductionRun` — attaches a
  user-uploaded video file (already stored via object-storage as an asset with a
  `storageUrl`) to a run as its produced video artifact. `AttachMediaInput` is
  `{ runId : Id; storageUrl : Text; mimeType : Text; durationSeconds : Float;
  aspectRatio : Text; cameoId : ?Id }`. Returns the updated run, or `null` if the
  run does not exist. The artifact's `characterId` is taken from the run.
- `getMediaArtifact(runId : Id) : ?MediaArtifact` (query) — the run's produced
  video artifact, or `null` when none is attached or the run does not exist.
- `deleteMediaArtifact(runId : Id) : Bool` — removes the run's produced video
  artifact. Returns `true` when an artifact existed and was removed, `false` when
  the run has no artifact or does not exist. Deletion removes the artifact from
  the `mediaArtifacts` store and clears the mirrored `mediaArtifact` reference on
  the run, so `getMediaArtifact(runId)` and `getRun(runId).mediaArtifact` both
  report `null` afterward. It does **not** delete the underlying stored file; the
  backend only drops its reference. Signed-in users only, matching the rest of the
  production surface.

`MediaArtifact` is `{ storageUrl : Text; mimeType : Text; durationSeconds :
Float; aspectRatio : Text; status : MediaArtifactStatus; characterId : ?Id;
cameoId : ?Id; createdAt : Timestamp }`. `MediaArtifactStatus` is
`#generating | #ready | #failed`. `ProductionRun` carries the artifact in its
`mediaArtifact : ?MediaArtifact` field, so `getRun` and `listRuns` expose it
alongside the existing agent text outputs. The artifact is a reference only; the
backend never fetches, validates, or transcodes the file.

### Video-output lifecycle

`ProductionRun` also carries `videoStatus : VideoOutputStatus`, an honest
lifecycle for the run's video output that is independent of whether an artifact
is attached. `VideoOutputStatus` is `#generating | #ready | #no_result`:

- `#generating` — the run is still processing (`RunStatus` `#pending`/`#running`)
  or a revision is being generated by `submitTweak`, so no final video result
  exists yet. A video cut must **not** be shown as a final no-result while this
  is `#generating`.
- `#ready` — a real media artifact is attached and playable.
- `#no_result` — processing finished and no artifact was attached.

Transitions: `startProductionRun` persists `#generating` while the run is in
flight and stores `#no_result` on completion (or `#halted`/`#failed`); a run that
already has an artifact stays `#ready`. `submitTweak` sets `#generating` while
the new revision is produced (unless an artifact is already attached, which stays
`#ready`) and returns to `#ready`/`#no_result` when it finishes. `attachMediaArtifact`
sets `#ready`; `deleteMediaArtifact` returns the run to `#no_result`. The backend
never synthesizes video — the artifact remains a user-attached real file.

`startProductionRun` persists `#generating` before the first inference call, so a
run's `videoStatus` is genuinely observable as `#generating` to concurrent
queries while the call is in flight. `submitTweak` returns before its
regeneration finishes, so its `#generating` state is likewise observable. A
caller that needs the terminal result must poll `getRun` (and `listRevisions`
for a tweak) until `videoStatus` is no longer `#generating`.

`attachMediaArtifact` is **not idempotent** in the sense that a retry replaces
the run's current artifact with the supplied one; calling it twice with the same
input converges to the same artifact. `deleteMediaArtifact` is safe to retry: the
first call returns `true` and removes the artifact, and every subsequent call
returns `false` without further effect.

## Video Generation API

External video generation sends **one chosen prompt** from an accepted run to
Replicate. Generation requires an admin-configured Replicate API token. When no
token is set, `startVideoGeneration` and `rerunVideoGeneration` return promptly
with the generation persisted directly as `#failed` and
`error = \"No Replicate API token configured\"` — the very first response already
reports that generation is unavailable, and no provider request is scheduled.
The failure is explicit and observable immediately, never silently swallowed and
never left hanging in `#generating`.

With a configured token, both methods return promptly: they persist the
`VideoGeneration` with `status = #generating` and `startedAt = now`, then defer
the Replicate outcall to a one-shot timer continuation. The continuation never
traps; on every path it settles the generation to a terminal state (`#ready`,
`#no_result`, or `#failed`). It creates the prediction with the chosen model sent
as the Replicate `version` field, records the returned prediction id, and polls
`GET https://api.replicate.com/v1/predictions/{id}` until the prediction reaches a
terminal status (`succeeded`/`failed`/`canceled`/`aborted`). On success it attaches the
provider's playable output URL to the run through the shared production path, so
the run's `videoStatus` becomes `#ready` and the video is playable. Poll
`getVideoGeneration` until `status` is no longer `#generating`.

### Models

- `listVideoModels() : [VideoModel]` (query) — the selectable models. Kling 3.0 is
  the default (`default = true`); Veo 3.1 is the premium option (`premium = true`).
  `VideoModel` is `{ id : Text; name : Text; provider : Text; premium : Bool;
  default : Bool }`.

### Prompt selection

- `listRunPrompts(runId : Id) : [VideoPromptOption]` (query) — the selectable
  prompt/cut options for a run, derived from the run's latest revision generated
  assets. `VideoPromptOption` is `{ index : Nat; agent : Text; content : Text }`;
  `index` is the stable position passed back to start/rerun, `agent` names the
  pipeline agent that produced it, and `content` is the exact prompt text. Returns
  an empty array when the run has no generated assets yet. Signed-in users only.

### Token configuration (admin only)

- `getReplicateTokenStatus() : ReplicateTokenStatus` (query) — `{ configured : Bool }`.
  The token value is never returned. Signed-in users may read the status.
- `setReplicateToken(token : Text) : ReplicateTokenStatus` — admin only; stores the
  token and returns the new status.
- `clearReplicateToken() : ReplicateTokenStatus` — admin only; removes the token and
  returns the new status.

### Generation

- `startVideoGeneration(input : StartVideoGenerationInput) : ?VideoGeneration` —
  starts generation for an accepted run with a chosen model and prompt.
  `StartVideoGenerationInput` is `{ runId : Id; modelId : ?Text; promptIndex : ?Nat }`;
  when `modelId` is absent the default model is used, and when `promptIndex` is
  absent the first prompt option is used. Exactly one prompt is submitted — the
  backend never fans out to multiple prompts. Returns the run's generation state,
  or `null` when the run does not exist. Traps when the run is not in a
  generatable state (only a `#completed` run has optimized prompts) or when
  `promptIndex` is out of range. A missing token is not a trap: the generation is
  persisted as `#failed` with an explicit error and returned immediately.
- `rerunVideoGeneration(input : RerunVideoGenerationInput) : ?VideoGeneration` —
  re-runs generation for a prior run. `RerunVideoGenerationInput` is
  `{ runId : Id; modelId : ?Text; promptIndex : ?Nat }`; when `modelId` is absent the
  prior model is reused, and when `promptIndex` is absent the prior generation's
  chosen prompt is reused. Returns the run's generation state, or `null` when the
  run does not exist. Traps when no prior generation exists or when `promptIndex`
  is out of range. A missing token is not a trap: the generation is persisted as
  `#failed` with an explicit error and returned immediately.
- `getVideoGeneration(runId : Id) : ?VideoGeneration` (query) — the run's current
  generation state, or `null` when generation has never been started for the run.
- `pollVideoGeneration(runId : Id) : ?VideoGeneration` — polls an in-flight
  generation against the provider and settles it when the prediction has finished.
  Returns the generation's current state, or `null` when no generation exists for
  the run. Safe to call repeatedly; a generation already in a terminal state is
  returned unchanged. When the generation has no recorded prediction id yet, a
  fresh chain heartbeat means the create request is still in flight and the call
  returns `#generating`; a stale or absent heartbeat means the create continuation
  was dropped, so the call restarts it (within the create grace window) or settles
  the generation to `#failed` once the window has passed. Signed-in users only.
- `recoverVideoGeneration(runId : Id) : ?VideoGeneration` — recovers a generation
  that was started but never settled in the app (for example one visible on the
  provider dashboard). Re-polls the recorded prediction and, when it is still in
  flight, restarts the polling chain so the generation settles to a terminal
  state even if the original continuation was lost. A generation whose create
  continuation was dropped before it recorded a prediction id is likewise
  restarted (or settled to `#failed` past the grace window). Returns the generation's
  current state, or `null` when no generation exists for the run. Signed-in users
  only.

`VideoGeneration` is `{ runId : Id; modelId : Text; status : VideoGenerationStatus;
startedAt : Timestamp; finishedAt : ?Timestamp; promptIndex : Nat; prompt : Text;
predictionId : ?Text; error : ?Text }`. `VideoGenerationStatus` is `#not_started |
#generating | #ready | #no_result | #failed`. `startedAt` is the wall-clock time the
current request began, so the UI can show elapsed time while `status` is
`#generating`. `promptIndex` is the position of the chosen prompt within the run's
prompt options and `prompt` is the exact text submitted, so the UI can show what
produced the video and a re-run can reuse it verbatim. `predictionId` is the
provider's prediction identifier once the create request has been accepted, so an
in-flight generation can be polled and recovered. `error` carries a human-readable
reason when `status` is `#failed`.

### Generation lifecycle and polling

`startVideoGeneration` and `rerunVideoGeneration` persist the generation and
return promptly. With a configured token the generation is persisted as
`#generating` and the Replicate outcall and the video download run in a deferred
one-shot timer continuation; without a token it is persisted directly as
`#failed` with `error = \"No Replicate API token configured\"` and no
continuation is scheduled. Poll `getVideoGeneration(runId)` until `status` is no
longer `#generating`:

- `#generating` — the request is in flight; `startedAt` is set and `finishedAt`
  is `null`. If the deferred continuation was lost, `pollVideoGeneration` or
  `recoverVideoGeneration` re-polls the recorded `predictionId` and restarts the
  polling chain, so the generation still settles to a terminal state.
- `#ready` — the provider returned a video and its playable output URL was
  attached to the run through the shared production path, so the run's
  `videoStatus` is also `#ready` and the video is playable.
- `#no_result` — the provider finished successfully without a usable output URL.
  `error` is `null`.
- `#failed` — the request could not be completed. `error` carries the reason,
  including the explicit `\"No Replicate API token configured\"` when no token is
  set, the provider's own error text when the prediction failed or was canceled
  (or when the create request was rejected), and
  `\"Replicate prediction did not finish in time\"` when the poll budget is
  exhausted.

The continuation never traps: every path settles the generation to a terminal
state, so a generation never remains stuck in `#generating`. A transient
transport failure while polling does **not** settle the generation; the chain
retries on the next tick, bounded by the poll budget, so a single network blip
cannot kill a generation.

### Polling-chain liveness

The backend tracks a per-run heartbeat for the active polling chain. A live
chain refreshes it on every tick; a heartbeat that has gone stale (or is absent)
means the continuation was dropped. `pollVideoGeneration` and
`recoverVideoGeneration` restart the chain whenever the generation is still
`#generating` and no live chain is active, so a lost continuation is recovered
rather than leaving the generation stuck. A live chain is left alone, so a public
poll cannot spawn a duplicate chain. The heartbeat is transient: after a canister
upgrade it is empty, and the next poll or recover call restarts the chain.

### Mutation retry safety

- `setReplicateToken` / `clearReplicateToken` are safe to retry: they converge to
  the same configured/cleared state.
- `startVideoGeneration` and `rerunVideoGeneration` are **not idempotent**: each
  call overwrites the run's generation record, schedules a new provider request,
  and spends provider credits. They return before the work finishes, so retrying a
  timed-out call can start a duplicate generation.
- `pollVideoGeneration` and `recoverVideoGeneration` are safe to retry: they only
  read the provider's prediction state and settle the generation once; a
  generation already terminal is returned unchanged.
- `getVideoGeneration` is a read-only query and is safe to poll.

## Optimization API (admin only)

- `listSuperSuitPatches() : [SuperSuitPatch]` (query)
- `getSuperSuitPatch(id) : ?SuperSuitPatch` (query)
- `approveSuperSuitPatch(id) : ?SuperSuitPatch` — only a `#pending_approval` patch
  transitions to `#approved` and promotes its `versionTag` onto the target agent's
  version history. Calling it on an already-decided patch returns that patch
  unchanged (idempotent). `null` if the id does not exist.
- `rejectSuperSuitPatch(id) : ?SuperSuitPatch` — only `#pending_approval` becomes
  `#rejected`; otherwise returns the patch unchanged. `null` if absent.
- `getAgentVersion(agent) : ?AgentVersion` (query) — `null` until the agent has an
  approved patch.
- `rollbackAgentVersion(agent) : ?AgentVersion` — reverts to the previous version
  in history and drops the current one. If history has fewer than two entries it
  returns the current version unchanged. `null` if the agent has no version.
- `getEntropyState() : EntropyState` (query) — `{ recentUpdateTimestamps;
  maxUpdatesPerHour }`; the ceiling is 3 updates per hour globally.
- `runCriticAgent() : ?SuperSuitPatch` — analyzes completed runs and drafts one
  patch. Returns `null` when the entropy ceiling is reached (fewer than 3 updates
  in the trailing hour). Otherwise it calls inference once, parses the response,
  and stores a patch. A patch whose text mentions immutable traits or identity
  blocks is stored directly as `#rejected` by the deterministic validation filter;
  all other patches are stored `#pending_approval` and locked from production
  until a human approves them.

### Mutation retry safety

- `approveSuperSuitPatch` / `rejectSuperSuitPatch` are idempotent for already-decided
  patches (they return the existing patch without further change).
- `runCriticAgent` is **not** idempotent: each successful call consumes one slot of
  the entropy ceiling and creates a new patch. Retrying after a timeout may create
  a duplicate patch and consume another slot.
- `startProductionRun` is **not** idempotent: each call allocates a new run id,
  writes new logs, and spends inference tokens. It returns before the pipeline
  finishes, so retrying a timed-out call can produce a duplicate run and
  duplicate token burn.
- `submitTweak` is **not** idempotent: each call schedules a regeneration that
  spends inference tokens and appends a revision. It returns `null` immediately,
  so retrying a timed-out call can schedule a duplicate regeneration.
- `createDna`, `createLore`, `createAsset` are not idempotent — each call allocates
  a new id.
- `createCameo` is not idempotent — each call allocates a new id.
- `updateCameo`, `deleteCameo` are safe to retry: they converge to the same state
  (delete returns `false` on the second call; update returns `null` once the row is
  gone).
- `deleteMediaArtifact` is safe to retry: it returns `true` once and `false`
  thereafter, and never affects the underlying stored file.
- `attachMediaArtifact` is safe to retry: a repeated call with the same input
  converges to the same artifact (it replaces the run's current artifact).
- `updateDna`, `updateLore`, `updateAsset`, `setLoreStatus`, `bumpDnaVersion`,
  `deleteDna`, `deleteLore`, `deleteAsset`, `rollbackAgentVersion` are safe to
  retry: they converge to the same state (delete returns `false` on the second
  call; update returns `null` once the row is gone).

## Errors, traps, and gotchas

- Authorization failures and unregistered callers **trap** (opaque reject), they do
  not return an error variant. The trap messages are quoted above.
- `getUserRole` traps for a signed-in but unregistered principal; this surfaces on
  every guarded endpoint, including queries.
- `startProductionRun` does **not** trap when inference is unavailable: it
  persists the run, detects the missing capability before calling, and settles
  the run to `#failed` with an explicit `fracture` log. The call returns that
  settled run; callers can also observe it by polling `getRun(runId)`.
- `runCriticAgent` returns `null` when the entropy ceiling blocks it. If the
  inference call itself fails, the call **traps** (the inference client traps on
  failure); it does not return `null`.
- The pipeline's lore/identity check is a deterministic keyword cross-reference,
  not semantic: it can produce false positives (a rule name appearing as a
  substring) and false negatives (paraphrased conflicts).
- Asset `storageUrl` is stored as text; the backend never fetches or validates it.
- OQL `schema()` / `execute()` are controller-only; end users cannot query them.
"
  };
};
