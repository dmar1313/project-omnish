import Common "common";

module {
  public type Id = Common.Id;
  public type Timestamp = Common.Timestamp;

  // ---- Prompt DNA Registry ----

  public type DnaRecord = {
    id : Id;
    characterName : Text;
    identityBlocks : Text;
    visualMarkers : Text;
    immutableTraits : Text;
    activeVersion : Nat;
    createdAt : Timestamp;
  };

  public type DnaInput = {
    characterName : Text;
    identityBlocks : Text;
    visualMarkers : Text;
    immutableTraits : Text;
  };

  // ---- World Lore ----

  public type LoreStatus = { #active; #deprecated };

  public type LoreRule = {
    id : Id;
    ruleName : Text;
    timelineConstraints : Text;
    universeBounds : Text;
    status : LoreStatus;
    createdAt : Timestamp;
  };

  public type LoreInput = {
    ruleName : Text;
    timelineConstraints : Text;
    universeBounds : Text;
  };

  // ---- Asset Ingredients ----

  public type AssetKind = { #image; #video; #audio };

  public type AssetIngredient = {
    id : Id;
    fileName : Text;
    fileType : AssetKind;
    storageUrl : Text;
    tags : [Text];
    linkedCharacterId : ?Id;
    createdAt : Timestamp;
  };

  public type AssetInput = {
    fileName : Text;
    fileType : AssetKind;
    storageUrl : Text;
    tags : [Text];
    linkedCharacterId : ?Id;
  };
};
