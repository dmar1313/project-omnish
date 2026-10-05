import Common "common";

module {
  public type Id = Common.Id;
  public type Timestamp = Common.Timestamp;

  // ---- Guided camera cameo capture ----

  // The three guided photo angles captured in order during a cameo session.
  public type CameoPhotoAngle = { #front; #left; #right };

  // A cameo session is a draft while photos/voice are still being captured and
  // becomes complete once all three photos and the voice sample are linked.
  public type CameoStatus = { #draft; #complete };

  // A cameo session links the captured asset ingredients to one character.
  // Asset ids reference AssetIngredient rows; the backend stores references
  // only and never generates or synthesizes media from them.
  public type CameoCapture = {
    id : Id;
    characterId : Id;
    frontAssetId : ?Id;
    leftAssetId : ?Id;
    rightAssetId : ?Id;
    voiceAssetId : ?Id;
    status : CameoStatus;
    createdAt : Timestamp;
  };

  // Input for creating or updating a cameo session. Any capture slot may be
  // absent while the session is still a draft.
  public type CameoInput = {
    characterId : Id;
    frontAssetId : ?Id;
    leftAssetId : ?Id;
    rightAssetId : ?Id;
    voiceAssetId : ?Id;
  };
};
