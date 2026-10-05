import Map "mo:core/Map";
import Iter "mo:core/Iter";
import OQL "mo:caffeineai-oql";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import Expose "mo:caffeineai-oql/Expose";
import Entity "mo:caffeineai-oql/Entity";
import MapEntity "mo:caffeineai-oql/MapEntity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import NatValue "mo:caffeineai-oql/NatValue";
import TextValue "mo:caffeineai-oql/TextValue";
import IntValue "mo:caffeineai-oql/IntValue";
import FloatValue "mo:caffeineai-oql/FloatValue";
import StudioTypes "types/studio";
import ProductionTypes "types/production";
import OptimizationTypes "types/optimization";
import CameoTypes "types/cameo";
import VideoTypes "types/video";
import StudioApi "mixins/studio-api";
import ProductionApi "mixins/production-api";
import OptimizationApi "mixins/optimization-api";
import CameoApi "mixins/cameo-api";
import VideoApi "mixins/video-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;

  let dna : Map.Map<StudioTypes.Id, StudioTypes.DnaRecord>;
  let lore : Map.Map<StudioTypes.Id, StudioTypes.LoreRule>;
  let assets : Map.Map<StudioTypes.Id, StudioTypes.AssetIngredient>;
  let nextDnaId : { var value : Nat };
  let nextLoreId : { var value : Nat };
  let nextAssetId : { var value : Nat };

  let cameos : Map.Map<CameoTypes.Id, CameoTypes.CameoCapture>;
  let nextCameoId : { var value : Nat };

  let runs : Map.Map<ProductionTypes.Id, ProductionTypes.ProductionRun>;
  let logs : Map.Map<ProductionTypes.Id, ProductionTypes.SimulationLog>;
  let nextRunId : { var value : Nat };
  let nextLogId : { var value : Nat };
  let revisions : Map.Map<ProductionTypes.Id, [ProductionTypes.Revision]>;
  let decisions : Map.Map<ProductionTypes.Id, ProductionTypes.RunDecisionState>;
  let mediaArtifacts : Map.Map<ProductionTypes.Id, ProductionTypes.MediaArtifact>;

  let patches : Map.Map<OptimizationTypes.Id, OptimizationTypes.SuperSuitPatch>;
  let versions : Map.Map<Text, OptimizationTypes.AgentVersion>;
  let entropy : OptimizationTypes.EntropyStateInternal;
  let nextPatchId : { var value : Nat };

  let replicateToken : { var value : ?Text };
  let videoGenerations : Map.Map<VideoTypes.Id, VideoTypes.VideoGeneration>;

  include MixinAuthorization(accessControlState, null);
  include MixinObjectStorage();

  include StudioApi(
    accessControlState,
    dna,
    lore,
    assets,
    nextDnaId,
    nextLoreId,
    nextAssetId,
  );

  include ProductionApi(
    accessControlState,
    runs,
    logs,
    dna,
    lore,
    assets,
    nextRunId,
    nextLogId,
    revisions,
    decisions,
    mediaArtifacts,
  );

  include OptimizationApi(
    accessControlState,
    patches,
    versions,
    entropy,
    nextPatchId,
    runs,
  );

  include CameoApi(accessControlState, cameos, nextCameoId);

  include VideoApi(accessControlState, replicateToken, videoGenerations, runs, mediaArtifacts);

  include ApiDocMixin();

  // ---- OQL entity projections ----

  func loreStatusText(status : StudioTypes.LoreStatus) : Text {
    switch (status) { case (#active) { "active" }; case (#deprecated) { "deprecated" } };
  };

  func assetKindText(kind : StudioTypes.AssetKind) : Text {
    switch (kind) { case (#image) { "image" }; case (#video) { "video" }; case (#audio) { "audio" } };
  };

  func runStatusText(status : ProductionTypes.RunStatus) : Text {
    switch (status) {
      case (#pending) { "pending" };
      case (#running) { "running" };
      case (#completed) { "completed" };
      case (#halted) { "halted" };
      case (#failed) { "failed" };
    };
  };

  func stepText(step : ProductionTypes.SimulationStep) : Text {
    switch (step) {
      case (#ingestion) { "ingestion" };
      case (#asset_binding) { "asset_binding" };
      case (#dna_crossref) { "dna_crossref" };
      case (#lore_check) { "lore_check" };
      case (#fracture) { "fracture" };
    };
  };

  func agentText(agent : ProductionTypes.AgentKind) : Text {
    switch (agent) { case (#writer) { "writer" }; case (#visual) { "visual" }; case (#continuity) { "continuity" } };
  };

  func patchStatusText(status : OptimizationTypes.PatchStatus) : Text {
    switch (status) {
      case (#pending_approval) { "pending_approval" };
      case (#rejected) { "rejected" };
      case (#approved) { "approved" };
    };
  };

  func optIdText(id : ?Nat) : Text {
    switch (id) { case (?v) { v.toText() }; case null { "" } };
  };

  func cameoStatusText(status : CameoTypes.CameoStatus) : Text {
    switch (status) { case (#draft) { "draft" }; case (#complete) { "complete" } };
  };

  func mediaStatusText(status : ProductionTypes.MediaArtifactStatus) : Text {
    switch (status) {
      case (#generating) { "generating" };
      case (#ready) { "ready" };
      case (#failed) { "failed" };
    };
  };

  func videoOutputStatusText(status : ProductionTypes.VideoOutputStatus) : Text {
    switch (status) {
      case (#generating) { "generating" };
      case (#ready) { "ready" };
      case (#no_result) { "no_result" };
    };
  };

  func decisionText(decision : ProductionTypes.RunDecision) : Text {
    switch (decision) {
      case (#in_progress) { "in_progress" };
      case (#completed) { "completed" };
      case (#approved) { "approved" };
      case (#rejected) { "rejected" };
    };
  };

  func optText(value : ?Text) : Text {
    switch (value) { case (?v) { v }; case null { "" } };
  };

  func optTimestampText(value : ?Int) : Text {
    switch (value) { case (?v) { v.toText() }; case null { "" } };
  };

  func videoGenerationStatusText(status : VideoTypes.VideoGenerationStatus) : Text {
    switch (status) {
      case (#not_started) { "not_started" };
      case (#generating) { "generating" };
      case (#ready) { "ready" };
      case (#no_result) { "no_result" };
      case (#failed) { "failed" };
    };
  };

  func revisionInstructionText(revision : ProductionTypes.Revision) : Text {
    optText(revision.instruction);
  };

  func revisionAgentCount(revision : ProductionTypes.Revision) : Nat {
    revision.generatedAssets.size();
  };

  func revisionFormatCount(revision : ProductionTypes.Revision) : Nat {
    revision.formatOutputs.size();
  };

  // Flatten `Map<Id, [Revision]>` into one `(runId, Revision)` row per revision.
  func revisionRows() : Iter.Iter<(ProductionTypes.Id, ProductionTypes.Revision)> {
    revisions.entries().flatMap(
      func((runId, revs)) = revs.values().map(func(rev) = (runId, rev))
    );
  };

  include Expose({
    entities = [
      dna.toEntity("dnaRecord", "DnaRecord", "id")
        .sample({
          id = 0;
          characterName = "";
          identityBlocks = "";
          visualMarkers = "";
          immutableTraits = "";
          activeVersion = 1;
          createdAt = 0;
        })
        .controllerOnly()
        .build(),
      lore.toEntityManual("loreRule", "LoreRule", "id")
        .sample({
          id = 0;
          ruleName = "";
          timelineConstraints = "";
          universeBounds = "";
          status = #active;
          createdAt = 0;
        })
        .payload("id", func(r) = r.id)
        .payload("ruleName", func(r) = r.ruleName)
        .payload("timelineConstraints", func(r) = r.timelineConstraints)
        .payload("universeBounds", func(r) = r.universeBounds)
        .payload("status", func(r) = loreStatusText(r.status))
        .payload("createdAt", func(r) = r.createdAt)
        .controllerOnly()
        .build(),
      assets.toEntityManual("assetIngredient", "AssetIngredient", "id")
        .sample({
          id = 0;
          fileName = "";
          fileType = #image;
          storageUrl = "";
          tags = [];
          linkedCharacterId = null;
          createdAt = 0;
        })
        .payload("id", func(a) = a.id)
        .payload("fileName", func(a) = a.fileName)
        .payload("fileType", func(a) = assetKindText(a.fileType))
        .payload("storageUrl", func(a) = a.storageUrl)
        .payload("tags", func(a) = a.tags.values().join(", "))
        .payload("linkedCharacterId", func(a) = optIdText(a.linkedCharacterId))
        .payload("createdAt", func(a) = a.createdAt)
        .controllerOnly()
        .build(),
      runs.toEntityManual("productionRun", "ProductionRun", "id")
        .sample({
          id = 0;
          promptId = null;
          characterId = null;
          rawInput = "";
          status = #pending;
          generatedAssets = [];
          formatOutputs = [];
          tokenCostBurn = 0.0;
          timestamp = 0;
          mediaArtifact = null;
          videoStatus = #no_result;
        })
        .payload("id", func(r) = r.id)
        .payload("promptId", func(r) = optIdText(r.promptId))
        .payload("characterId", func(r) = optIdText(r.characterId))
        .payload("rawInput", func(r) = r.rawInput)
        .payload("status", func(r) = runStatusText(r.status))
        .payload("agentOutputCount", func(r) = r.generatedAssets.size())
        .payload("formatOutputCount", func(r) = r.formatOutputs.size())
        .payload("tokenCostBurn", func(r) = r.tokenCostBurn)
        .payload("timestamp", func(r) = r.timestamp)
        .payload("videoStatus", func(r) = videoOutputStatusText(r.videoStatus))
        .controllerOnly()
        .build(),
      logs.toEntityManual("simulationLog", "SimulationLog", "id")
        .sample({
          id = 0;
          runId = 0;
          rawInput = "";
          stepName = #ingestion;
          evaluationOutput = "";
          timestamp = 0;
        })
        .payload("id", func(l) = l.id)
        .payload("runId", func(l) = l.runId)
        .payload("rawInput", func(l) = l.rawInput)
        .payload("stepName", func(l) = stepText(l.stepName))
        .payload("evaluationOutput", func(l) = l.evaluationOutput)
        .payload("timestamp", func(l) = l.timestamp)
        .controllerOnly()
        .build(),
      patches.toEntityManual("superSuitPatch", "SuperSuitPatch", "id")
        .sample({
          id = 0;
          targetAgent = #writer;
          proposedPromptPatch = "";
          performanceDeltaMetrics = "";
          status = #pending_approval;
          versionTag = "";
          createdAt = 0;
        })
        .payload("id", func(p) = p.id)
        .payload("targetAgent", func(p) = agentText(p.targetAgent))
        .payload("proposedPromptPatch", func(p) = p.proposedPromptPatch)
        .payload("performanceDeltaMetrics", func(p) = p.performanceDeltaMetrics)
        .payload("status", func(p) = patchStatusText(p.status))
        .payload("versionTag", func(p) = p.versionTag)
        .payload("createdAt", func(p) = p.createdAt)
        .controllerOnly()
        .build(),
      cameos.toEntityManual("cameoCapture", "CameoCapture", "id")
        .sample({
          id = 0;
          characterId = 0;
          frontAssetId = null;
          leftAssetId = null;
          rightAssetId = null;
          voiceAssetId = null;
          status = #draft;
          createdAt = 0;
        })
        .payload("id", func(c) = c.id)
        .payload("characterId", func(c) = c.characterId)
        .payload("frontAssetId", func(c) = optIdText(c.frontAssetId))
        .payload("leftAssetId", func(c) = optIdText(c.leftAssetId))
        .payload("rightAssetId", func(c) = optIdText(c.rightAssetId))
        .payload("voiceAssetId", func(c) = optIdText(c.voiceAssetId))
        .payload("status", func(c) = cameoStatusText(c.status))
        .payload("createdAt", func(c) = c.createdAt)
        .controllerOnly()
        .build(),
      OQL.Entity.manual<(ProductionTypes.Id, ProductionTypes.Revision)>(
        "runRevision",
        revisionRows,
        "RunRevision",
        "revisionKey",
      )
        .sample((0, {
          revisionNumber = 0;
          instruction = null;
          generatedAssets = [];
          formatOutputs = [];
          tokenCostBurn = 0.0;
          timestamp = 0;
        }))
        .payload("revisionKey", func((runId, r)) = runId.toText() # ":" # r.revisionNumber.toText())
        .payload("runId", func((runId, _)) = runId)
        .edge("runId", "productionRun")
        .payload("revisionNumber", func((_, r)) = r.revisionNumber)
        .payload("instruction", func((_, r)) = revisionInstructionText(r))
        .payload("agentOutputCount", func((_, r)) = revisionAgentCount(r))
        .payload("formatOutputCount", func((_, r)) = revisionFormatCount(r))
        .payload("tokenCostBurn", func((_, r)) = r.tokenCostBurn)
        .payload("timestamp", func((_, r)) = r.timestamp)
        .controllerOnly()
        .build(),
      OQL.Entity.manual<(ProductionTypes.Id, ProductionTypes.RunDecisionState)>(
        "runDecision",
        func() = decisions.entries(),
        "RunDecisionState",
        "runId",
      )
        .sample((0, {
          decision = #in_progress;
          acceptedRevision = null;
          rejectionReason = null;
        }))
        .payload("runId", func((runId, _)) = runId)
        .edge("runId", "productionRun")
        .payload("decision", func((_, d)) = decisionText(d.decision))
        .payload("acceptedRevision", func((_, d)) = optIdText(d.acceptedRevision))
        .payload("rejectionReason", func((_, d)) = optText(d.rejectionReason))
        .controllerOnly()
        .build(),
      OQL.Entity.manual<(ProductionTypes.Id, ProductionTypes.MediaArtifact)>(
        "mediaArtifact",
        func() = mediaArtifacts.entries(),
        "MediaArtifact",
        "runId",
      )
        .sample((0, {
          storageUrl = "";
          mimeType = "";
          durationSeconds = 0.0;
          aspectRatio = "";
          status = #ready;
          characterId = null;
          cameoId = null;
          createdAt = 0;
        }))
        .payload("runId", func((runId, _)) = runId)
        .edge("runId", "productionRun")
        .payload("storageUrl", func((_, a)) = a.storageUrl)
        .payload("mimeType", func((_, a)) = a.mimeType)
        .payload("durationSeconds", func((_, a)) = a.durationSeconds)
        .payload("aspectRatio", func((_, a)) = a.aspectRatio)
        .payload("status", func((_, a)) = mediaStatusText(a.status))
        .payload("characterId", func((_, a)) = optIdText(a.characterId))
        .payload("cameoId", func((_, a)) = optIdText(a.cameoId))
        .payload("createdAt", func((_, a)) = a.createdAt)
        .controllerOnly()
        .build(),
      OQL.Entity.manual<(Text, OptimizationTypes.AgentVersion)>(
        "agentVersion",
        func() = versions.entries(),
        "AgentVersion",
        "agentKey",
      )
        .sample(("", {
          agent = #writer;
          currentVersion = "";
          history = [];
        }))
        .payload("agentKey", func((key, _)) = key)
        .payload("agent", func((_, v)) = agentText(v.agent))
        .payload("currentVersion", func((_, v)) = v.currentVersion)
        .payload("historyCount", func((_, v)) = v.history.size())
        .controllerOnly()
        .build(),
      videoGenerations.toEntityManual("videoGeneration", "VideoGeneration", "runId")
        .sample({
          runId = 0;
          modelId = "";
          status = #not_started;
          startedAt = 0;
          finishedAt = null;
          promptIndex = 0;
          prompt = "";
          predictionId = null;
          error = null;
        })
        .payload("runId", func(g) = g.runId)
        .edge("runId", "productionRun")
        .payload("modelId", func(g) = g.modelId)
        .payload("status", func(g) = videoGenerationStatusText(g.status))
        .payload("startedAt", func(g) = g.startedAt)
        .payload("finishedAt", func(g) = optTimestampText(g.finishedAt))
        .payload("promptIndex", func(g) = g.promptIndex)
        .payload("prompt", func(g) = g.prompt)
        .payload("predictionId", func(g) = optText(g.predictionId))
        .payload("error", func(g) = optText(g.error))
        .controllerOnly()
        .build(),
    ];
  });
};
