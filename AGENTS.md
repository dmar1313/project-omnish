# Project Guidance

## User Preferences

- Kling 3.0 is the default video generation model; Veo 3.1 is selectable as premium
- Replicate is the external video generator and requires an admin-configured API token
- Video cuts must show a generating/loading state while a run is processing, never an immediate final result
- Honest in-product messaging about platform capability limits
- The user picks which prompt/cut to generate; never auto-generate multiple prompts at once

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The production run pipeline depends on the Caffeine Inference extension; when CAFFEINE_INFERENCE_API_KEY is not set the inference call traps IC0503, so a run started in that environment cannot progress and must settle to an honest error rather than hanging.
- startRun now awaits processRun inline instead of deferring it on a Timer continuation, so a dropped continuation can no longer leave a run stuck in #running with 0 stages logged.
- processRun is written to never trap (inference failures settle #failed, lore/identity conflicts settle #halted), so awaiting it inline from startRun always reaches a terminal state.
- The video pipeline is independent of the run pipeline: it uses the admin Replicate token, not the inference extension.
- A generation with a null predictionId is ambiguous between 'create request still in flight' and 'continuation dropped'; gating settlement on a grace window measured from the stable startedAt distinguishes them.
- The local preflight can now reach authenticated surfaces via the test-only sign-in path, but the preview environment has no CAFFEINE_INFERENCE_API_KEY, so inference-backed run progression cannot be verified there.
- Config.fromEnv<system>() traps synchronously when CAFFEINE_INFERENCE_API_KEY is unset; wrapping it as `ignore await async <expr>` inside a try in an async helper yields a non-trapping availability probe (Inference.isAvailable<system>()).
- Motoko `try` only wraps an async expression; a synchronous call that can trap must be wrapped as `ignore await async <expr>` inside the try, and the enclosing helper must be declared async.
- Probing inference availability before the awaited call lets the run pipeline settle #failed deterministically, rather than relying on a trap raised inside an await* being caught by the enclosing try/catch.
- beginGeneration persists #failed with an explicit error and schedules no continuation when no Replicate token is configured, so the first startVideoGeneration response already reports unavailability.
- Video models such as Kling 3.0 and Veo 3.1 routinely take several minutes to render, so the poll budget is ~10 minutes (600 one-second polls) to avoid falsely failing legitimate generations while still guaranteeing an eventual terminal state.
- Replicate's POST /v1/predictions accepts official model identifiers in owner/name form in the `version` field, so kwaivgi/kling-v3-video and google/veo-3.1 can be sent directly without a version hash.
- startRun awaits processRun inline, so the frontend mutation resolves only after the run is terminal; polling while startRun.isPending still observes the persisted #running row and incremental logs.
- The local preflight could not verify runtime behavior (tester_error, child_transport/tester_session_failed); the preview environment also has no CAFFEINE_INFERENCE_API_KEY, so inference-backed run progression cannot be verified there.
- An uncaught trap in an awaited local async helper rolls back the entire enclosing update call, so a run persisted as #running before the await can vanish rather than settle; wrapping the awaited helper in try/catch and settling in the catch keeps the run observable and terminal.
- A terminal-state guard after the awaited pipeline (re-checking the persisted run status and settling #running to #failed) is the direct guarantee that a run can never remain #running with no progress, independent of how the pipeline exits.
- The create phase of a timer-driven provider chain needs its own heartbeat: without one, a dropped create continuation is indistinguishable from a live one, so a public poll can only wait out the grace window and settle failed rather than restarting the create.
- A dropped create continuation is recoverable: restarting the generation from its persisted modelId and prompt re-issues the provider request, so pollGeneration/recoverGeneration can recover it within the grace window instead of only settling it failed.
- A transient transport error on the provider create request should retry on the next tick bounded by the same poll budget as the poll chain, rather than failing the generation on the first blip.
- The diagnostic journey harness (src/frontend/src/test/journey.tsx) reports the exact step, error, and observed app response on failure and refuses to pass with zero steps; the PocketIC lane's callMethod wrapper names the exact public method that traps.
- The local preflight now verifies the run reaches a terminal Failed state with stage logs and an explicit 'inference capability is unavailable' message, and the videos screen shows an explicit no-result state with the Replicate token reported as not configured.
- IC HTTPS outcalls are rejected if the external server does not respond within 30 seconds, so a Replicate create request must NOT send `Prefer: wait` for video models: the waiting create always times out, and the retry (with a fresh Idempotency-Key) creates a duplicate prediction while never recording a prediction id to poll.
- The correct Replicate video pattern under the 30s outcall limit is an async create (no `Prefer: wait`) that returns the prediction id immediately with status starting/processing, followed by polling GET /v1/predictions/{id} until a terminal status.
- Replicate prediction `output` for Kling/Veo is a top-level string URL (replicate.delivery) that jsonOutputUrl extracts; the URL is publicly playable but expires after one hour, so durable playback would require copying the file into platform object storage.
- settleFromResponse gates #ready on attachVideo returning true, so a succeeded prediction with a missing run settles #failed instead of showing a ready video with no artifact.
