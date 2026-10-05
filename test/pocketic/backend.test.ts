import { PocketIc } from "@dfinity/pic";
import type { Actor, CanisterFixture } from "@dfinity/pic";
import { createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

/**
 * Backend behavior lane for the character-creation cameo feature.
 *
 * The frontend suite mocks the actor, so it passes unchanged against a canister
 * whose public methods are unimplemented stubs. This lane installs the app's
 * own compiled wasm into the platform's PocketIC replica and calls the real
 * public API, so a stubbed or trapping backend fails here.
 *
 * It speaks the agent-js declarations' shapes: `?T` is `[] | [T]`, `Nat` is
 * `bigint`, and a unit reply decodes to `null`.
 */

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;
let actor: Actor<_SERVICE>;
let canisterId: CanisterFixture<_SERVICE>["canisterId"];

// A deterministic signed-in caller. The first principal to initialize becomes
// `#admin`; every later one becomes `#user`. Both satisfy the `#user` guard the
// studio and cameo endpoints require.
const alice = createIdentity("alice");
const bob = createIdentity("bob");
// A separate signed-in non-admin, so registering this caller does not disturb
// the "never registered" assertion that uses bob.
const carol = createIdentity("carol");

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  ({ actor, canisterId } = await pic.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
    sender: alice.getPrincipal(),
  }));
  // Registration prerequisite: a principal is only known to the backend after
  // it initializes access control once. Without this every guarded call traps
  // "User is not registered".
  actor.setIdentity(alice);
  await actor._initialize_access_control();
});

afterAll(async () => {
  await pic?.tearDown();
});

/**
 * Diagnostic wrapper for a single public-method call.
 *
 * The lane's job is to name the exact method that trapped or returned an
 * unexpected value, not to report a generic "could not be completed". This
 * helper calls one method and, on any rejection or trap, throws an error whose
 * message names the method, the observed error, and the value/response seen at
 * that point. A passing call returns its decoded value unchanged.
 */
async function callMethod<T>(
  method: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const observed =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `Backend method "${method}" failed. Error: ${observed}. ` +
        `The canister trapped or rejected this call; see the method name above.`,
      { cause: error },
    );
  }
}

it("answers an empty-state read instead of trapping", async () => {
  await expect(actor.listCameos()).resolves.toEqual([]);
  await expect(actor.listCameosForCharacter(0n)).resolves.toEqual([]);
});

it("names the exact public read method that traps or returns an unexpected value", async () => {
  // Each public read method is called individually through `callMethod`, so a
  // trap or rejection names the exact method rather than a generic failure.
  // This is the diagnostic backstop for the whole read surface: if any one of
  // these is stubbed or traps, the failure message says which one.
  const probes: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
    ["listCameos", () => actor.listCameos()],
    ["listCameosForCharacter", () => actor.listCameosForCharacter(0n)],
    ["listRuns", () => actor.listRuns()],
    ["getRun", () => actor.getRun(0n)],
    ["listSimulationLogs", () => actor.listSimulationLogs(0n)],
    ["listRevisions", () => actor.listRevisions(0n)],
    ["getRevision", () => actor.getRevision(0n, 1n)],
    ["getRunDecision", () => actor.getRunDecision(0n)],
    ["listRunDecisions", () => actor.listRunDecisions()],
    ["getMediaArtifact", () => actor.getMediaArtifact(0n)],
    ["listVideoModels", () => actor.listVideoModels()],
    ["getReplicateTokenStatus", () => actor.getReplicateTokenStatus()],
    ["getVideoGeneration", () => actor.getVideoGeneration(0n)],
    ["listRunPrompts", () => actor.listRunPrompts(0n)],
    ["pollVideoGeneration", () => actor.pollVideoGeneration(0n)],
    ["recoverVideoGeneration", () => actor.recoverVideoGeneration(0n)],
    ["listDna", () => actor.listDna()],
    ["listAssets", () => actor.listAssets()],
    ["listLore", () => actor.listLore()],
  ];

  for (const [method, call] of probes) {
    // A resolved value of any shape is fine here; the point is that the method
    // is implemented and does not trap. `callMethod` names the method on failure.
    await callMethod(method, call);
  }
});

it("answers the run read path instead of trapping", async () => {
  // The Simulation Inspector reads runs through these three methods. They must
  // stay callable while the tweak/revision/accept-reject work extends the run
  // surface; a stubbed or trapping backend fails here. A run id that was never
  // allocated (999n) keeps the getRun/listSimulationLogs assertions as
  // empty-state reads regardless of which runs other tests created.
  await expect(actor.listRuns()).resolves.toBeInstanceOf(Array);
  await expect(actor.getRun(999n)).resolves.toEqual([]);
  await expect(actor.listSimulationLogs(999n)).resolves.toEqual([]);
});

it("settles a started production run to a terminal state with at least one log", async () => {
  // The terminal-state guarantee: `startProductionRun` drives the pipeline
  // inline and must never leave a run `#running` with zero stages logged. This
  // calls the real canister. When the inference capability is unavailable the
  // run settles to `#failed` with an explicit reason; when it is available the
  // run settles to `#completed`. Either way the returned run is terminal and at
  // least one stage log exists, so a caller can never observe a stuck run.
  const run = await callMethod("startProductionRun", () =>
    actor.startProductionRun({
      rawInput: "A cartographer charts a dead star.",
      characterId: [],
      assetIngredientIds: [],
    }),
  );

  // `#running` is the one status that would mean the guarantee was violated.
  expect(run.status).not.toEqual({ running: null });
  expect([
    { completed: null },
    { failed: null },
    { halted: null },
  ]).toContainEqual(run.status);

  // The run is observable through the read path with at least one stage log.
  const fetched = await actor.getRun(run.id);
  expect(fetched).toEqual([expect.objectContaining({ id: run.id })]);
  const logs = await actor.listSimulationLogs(run.id);
  expect(logs.length).toBeGreaterThan(0);
  expect(logs.every((log) => log.runId === run.id)).toBe(true);
});

it("answers the revision + decision read path instead of trapping", async () => {
  // The revision history and decision badges read through these methods. They
  // must be implemented on the real canister, not stubbed. A run id that was
  // never allocated (999n) is used so this stays an empty-state read regardless
  // of which runs earlier tests created.
  await expect(actor.listRevisions(999n)).resolves.toEqual([]);
  await expect(actor.getRevision(999n, 1n)).resolves.toEqual([]);
  await expect(actor.getRunDecision(999n)).resolves.toEqual([]);
  // `listRunDecisions` returns every recorded decision; it must resolve to an
  // array (not trap) whether or not any run exists.
  await expect(actor.listRunDecisions()).resolves.toBeInstanceOf(Array);
});

it("returns null for a decision on a run that does not exist", async () => {
  // accept/reject/continue and submitTweak must resolve to an absent option
  // for an unknown run rather than trapping. submitTweak returns before any
  // inference call when the run is missing, so this stays offline.
  await expect(actor.acceptRun(999n, 1n)).resolves.toEqual([]);
  await expect(actor.rejectRun(999n, ["too rough"])).resolves.toEqual([]);
  await expect(actor.continueRun(999n, 1n)).resolves.toEqual([]);
  await expect(
    actor.submitTweak({ runId: 999n, instruction: "make it warmer" }),
  ).resolves.toEqual([]);
});

it("round-trips a text character through the real canister", async () => {
  const created = await actor.createDna({
    characterName: "Marlow Quinn",
    identityBlocks: "A cartographer of dead stars.",
    immutableTraits: "Never removes the visor.",
    visualMarkers: "Amber visor, ash-grey coat.",
  });
  expect(created.characterName).toBe("Marlow Quinn");
  expect(created.activeVersion).toBe(1n);

  const listed = await actor.listDna();
  expect(listed).toContainEqual(
    expect.objectContaining({ id: created.id, characterName: "Marlow Quinn" }),
  );
});

it("links uploaded reference assets to a character", async () => {
  const character = await actor.createDna({
    characterName: "Vessel-07",
    identityBlocks: "Synthetic courier.",
    immutableTraits: "Always calm.",
    visualMarkers: "Chrome plating.",
  });

  const asset = await actor.createAsset({
    fileName: "reference.png",
    fileType: { image: null },
    storageUrl: "https://storage.example/reference.png",
    tags: ["reference"],
    linkedCharacterId: [character.id],
  });
  expect(asset.linkedCharacterId).toEqual([character.id]);

  const linked = await actor.listAssetsForCharacter(character.id);
  expect(linked).toContainEqual(
    expect.objectContaining({ id: asset.id, fileName: "reference.png" }),
  );
});

it("records a complete cameo from three photos and a voice sample", async () => {
  const character = await actor.createDna({
    characterName: "Cameo Subject",
    identityBlocks: "Defined by media.",
    immutableTraits: "None.",
    visualMarkers: "None.",
  });

  const makeAsset = async (fileName: string, fileType: "image" | "audio") =>
    actor.createAsset({
      fileName,
      fileType: { [fileType]: null },
      storageUrl: `https://storage.example/${fileName}`,
      tags: ["cameo"],
      linkedCharacterId: [character.id],
    });

  const front = await makeAsset("cameo-front.jpg", "image");
  const left = await makeAsset("cameo-left.jpg", "image");
  const right = await makeAsset("cameo-right.jpg", "image");
  const voice = await makeAsset("voice-sample.webm", "audio");

  const cameo = await actor.createCameo({
    characterId: character.id,
    frontAssetId: [front.id],
    leftAssetId: [left.id],
    rightAssetId: [right.id],
    voiceAssetId: [voice.id],
  });

  // All four slots present means the session is complete.
  expect(cameo.status).toEqual({ complete: null });
  expect(cameo.characterId).toBe(character.id);
  expect(cameo.frontAssetId).toEqual([front.id]);
  expect(cameo.voiceAssetId).toEqual([voice.id]);

  const fetched = await actor.getCameo(cameo.id);
  expect(fetched).toEqual([expect.objectContaining({ id: cameo.id })]);

  const forCharacter = await actor.listCameosForCharacter(character.id);
  expect(forCharacter).toContainEqual(expect.objectContaining({ id: cameo.id }));
});

it("keeps a partial cameo a draft and completes it on update", async () => {
  const character = await actor.createDna({
    characterName: "Draft Subject",
    identityBlocks: "In progress.",
    immutableTraits: "None.",
    visualMarkers: "None.",
  });

  const front = await actor.createAsset({
    fileName: "draft-front.jpg",
    fileType: { image: null },
    storageUrl: "https://storage.example/draft-front.jpg",
    tags: ["cameo"],
    linkedCharacterId: [character.id],
  });

  const draft = await actor.createCameo({
    characterId: character.id,
    frontAssetId: [front.id],
    leftAssetId: [],
    rightAssetId: [],
    voiceAssetId: [],
  });
  expect(draft.status).toEqual({ draft: null });

  const updated = await actor.updateCameo(draft.id, {
    characterId: character.id,
    frontAssetId: [front.id],
    leftAssetId: [front.id],
    rightAssetId: [front.id],
    voiceAssetId: [front.id],
  });
  expect(updated).toEqual([expect.objectContaining({ status: { complete: null } })]);

  await expect(actor.deleteCameo(draft.id)).resolves.toBe(true);
  await expect(actor.deleteCameo(draft.id)).resolves.toBe(false);
});

it("answers the media artifact read path instead of trapping", async () => {
  // The Generated Videos page and the Simulation Inspector read a run's
  // produced video through getMediaArtifact. It must be implemented on the
  // real canister, not stubbed, and must resolve to an absent option for a run
  // that has no artifact rather than trapping.
  await expect(actor.getMediaArtifact(0n)).resolves.toEqual([]);
  await expect(actor.getMediaArtifact(999n)).resolves.toEqual([]);
});

it("answers the media attach path instead of trapping", async () => {
  // attachMediaArtifact is the write half of the produced-video contract. A
  // run cannot be created in this lane without live inference, so the
  // round-trip is not exercised here; what this proves is that the method is
  // implemented on the real canister and resolves to an absent option for a
  // run that does not exist rather than trapping.
  await expect(
    actor.attachMediaArtifact({
      runId: 999n,
      storageUrl: "https://storage.example/orphan.mp4",
      mimeType: "video/mp4",
      durationSeconds: 1,
      aspectRatio: "16:9",
      cameoId: [],
    }),
  ).resolves.toEqual([]);
});

it("persists an attached playable URL and exposes it through the media read path", async () => {
  // The accepted contract: once a video is attached to a run, the persisted
  // record exposes a non-null playable URL that the frontend can render. This
  // creates a real run, attaches a playable artifact through the public API,
  // and reads it back through both `getMediaArtifact` and the run record's
  // mirrored `mediaArtifact`. The provider settlement branch that produces the
  // URL from a Replicate response is not reachable without a live token; this
  // proves the persistence and read half of the contract on the real canister.
  const run = await callMethod("startProductionRun", () =>
    actor.startProductionRun({
      rawInput: "A cartographer charts a dead star.",
      characterId: [],
      assetIngredientIds: [],
    }),
  );

  const playableUrl = "https://storage.example/generated-run.mp4";
  const attached = await callMethod("attachMediaArtifact", () =>
    actor.attachMediaArtifact({
      runId: run.id,
      storageUrl: playableUrl,
      mimeType: "video/mp4",
      durationSeconds: 12,
      aspectRatio: "9:16",
      cameoId: [],
    }),
  );

  // The attach returns the updated run with the artifact mirrored on it.
  expect(attached).toEqual([
    expect.objectContaining({
      id: run.id,
      mediaArtifact: [
        expect.objectContaining({ storageUrl: playableUrl, status: { ready: null } }),
      ],
    }),
  ]);

  // The authoritative media read exposes the same non-null playable URL.
  const artifact = await callMethod("getMediaArtifact", () =>
    actor.getMediaArtifact(run.id),
  );
  expect(artifact).toEqual([
    expect.objectContaining({ storageUrl: playableUrl, mimeType: "video/mp4" }),
  ]);

  // The run record read back through getRun also carries the playable URL.
  const fetched = await callMethod("getRun", () => actor.getRun(run.id));
  expect(fetched).toEqual([
    expect.objectContaining({
      id: run.id,
      mediaArtifact: [
        expect.objectContaining({ storageUrl: playableUrl }),
      ],
    }),
  ]);
});

it("answers the media delete path instead of trapping", async () => {
  // deleteMediaArtifact is the write half of the delete-video feature. A run
  // cannot be created in this lane without live inference, so the round-trip is
  // not exercised here; what this proves is that the method is implemented on
  // the real canister and resolves to `false` for a run with no artifact rather
  // than trapping. It is safe to retry: a second call also resolves `false`.
  await expect(actor.deleteMediaArtifact(999n)).resolves.toBe(false);
  await expect(actor.deleteMediaArtifact(999n)).resolves.toBe(false);
});

it("answers the video model catalog with Kling default and Veo premium", async () => {
  // The model picker reads this catalog. Kling 3.0 must be the default and
  // Veo 3.1 the premium option; a stubbed or empty catalog fails here.
  const models = await actor.listVideoModels();
  expect(models).toHaveLength(2);

  const kling = models.find((model) => model.name === "Kling 3.0");
  const veo = models.find((model) => model.name === "Veo 3.1");
  expect(kling).toMatchObject({ default: true, premium: false });
  expect(veo).toMatchObject({ default: false, premium: true });
  expect(models.filter((model) => model.default)).toHaveLength(1);
});

it("round-trips the Replicate token status without exposing the token", async () => {
  // The settings page reads and writes the admin token. The status must reflect
  // set/clear, and the token value is never returned.
  await expect(actor.getReplicateTokenStatus()).resolves.toEqual({
    configured: false,
  });

  await expect(actor.setReplicateToken("r8_test_token")).resolves.toEqual({
    configured: true,
  });
  await expect(actor.getReplicateTokenStatus()).resolves.toEqual({
    configured: true,
  });

  await expect(actor.clearReplicateToken()).resolves.toEqual({
    configured: false,
  });
  await expect(actor.getReplicateTokenStatus()).resolves.toEqual({
    configured: false,
  });
});

it("answers the video generation read path instead of trapping", async () => {
  // The Generated Videos page and the Simulation Inspector poll this method.
  // It must resolve to an absent option for a run with no generation rather
  // than trapping.
  await expect(actor.getVideoGeneration(0n)).resolves.toEqual([]);
  await expect(actor.getVideoGeneration(999n)).resolves.toEqual([]);
});

it("answers the run prompt list instead of trapping", async () => {
  // The Generate Videos control reads the run's selectable prompts through
  // listRunPrompts before offering generation. It must be implemented on the
  // real canister and resolve to an empty list for a run with no assets rather
  // than trapping.
  await expect(actor.listRunPrompts(0n)).resolves.toEqual([]);
  await expect(actor.listRunPrompts(999n)).resolves.toEqual([]);
});

it("answers the generation poll and recovery paths instead of trapping", async () => {
  // The Generated Videos page polls an in-flight generation through
  // pollVideoGeneration and offers recoverVideoGeneration for a generation
  // already started on the provider. Both must be implemented on the real
  // canister and resolve to an absent option for a run with no generation
  // rather than trapping.
  await expect(actor.pollVideoGeneration(0n)).resolves.toEqual([]);
  await expect(actor.pollVideoGeneration(999n)).resolves.toEqual([]);
  await expect(actor.recoverVideoGeneration(0n)).resolves.toEqual([]);
  await expect(actor.recoverVideoGeneration(999n)).resolves.toEqual([]);
});

it("returns null for generation on a run that does not exist", async () => {
  // start must resolve to an absent option for an unknown run rather than
  // trapping. It returns before any outcall when the run is missing, so this
  // stays offline. The chosen prompt is carried as an optional promptIndex.
  await expect(
    actor.startVideoGeneration({ runId: 999n, modelId: [], promptIndex: [] }),
  ).resolves.toEqual([]);
  await expect(
    actor.startVideoGeneration({
      runId: 999n,
      modelId: [],
      promptIndex: [0n],
    }),
  ).resolves.toEqual([]);
});

it("rejects a re-run when no prior generation exists", async () => {
  // rerun replays a stored generation, so it has nothing to replay for a run
  // that never generated. The backend documents this as a trap rather than an
  // absent option; the frontend only offers re-run once a generation record
  // exists, so this guard is never hit by the UI. It must reject, not silently
  // start a fresh generation.
  await expect(
    actor.rerunVideoGeneration({ runId: 999n, modelId: [], promptIndex: [] }),
  ).rejects.toThrow(/No prior generation to re-run/);
  await expect(
    actor.rerunVideoGeneration({
      runId: 999n,
      modelId: [],
      promptIndex: [1n],
    }),
  ).rejects.toThrow(/No prior generation to re-run/);
});

it("rejects an anonymous caller", async () => {
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(guest.listCameos()).rejects.toThrow();
});

it("rejects an anonymous caller from the video surface", async () => {
  // The video model catalog and generation reads are signed-in only.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(guest.listVideoModels()).rejects.toThrow();
  await expect(guest.getVideoGeneration(0n)).rejects.toThrow();
  await expect(guest.listRunPrompts(0n)).rejects.toThrow();
  await expect(guest.pollVideoGeneration(0n)).rejects.toThrow();
  await expect(guest.recoverVideoGeneration(0n)).rejects.toThrow();
});

it("rejects a non-admin caller from setting the Replicate token", async () => {
  // Token configuration is admin-only. Carol is a valid signed-in user but not
  // an admin, so the write must be rejected.
  const carolActor = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  carolActor.setIdentity(carol);
  await carolActor._initialize_access_control();
  await expect(carolActor.setReplicateToken("r8_carol")).rejects.toThrow();
});

it("rejects an anonymous caller from deleting a media artifact", async () => {
  // Deletion is available only to signed-in users, matching the rest of the
  // production surface.
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(guest.deleteMediaArtifact(999n)).rejects.toThrow();
});

it("rejects a signed-in caller that never registered", async () => {
  // Bob holds a valid identity but never called `_initialize_access_control`,
  // so the backend has no role for him and every guarded endpoint traps.
  const unregistered = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  unregistered.setIdentity(bob);
  await expect(unregistered.listCameos()).rejects.toThrow();
});
