import Map "mo:core/Map";
import Time "mo:core/Time";
import Types "../types/studio";

module {
  // ---- Prompt DNA Registry ----

  public func listDna(records : Map.Map<Types.Id, Types.DnaRecord>) : [Types.DnaRecord] {
    records.values().toArray();
  };

  public func getDna(records : Map.Map<Types.Id, Types.DnaRecord>, id : Types.Id) : ?Types.DnaRecord {
    records.get(id);
  };

  public func createDna(records : Map.Map<Types.Id, Types.DnaRecord>, nextId : { var value : Nat }, input : Types.DnaInput) : Types.DnaRecord {
    let id = nextId.value;
    nextId.value := id + 1;
    let record : Types.DnaRecord = {
      id;
      characterName = input.characterName;
      identityBlocks = input.identityBlocks;
      visualMarkers = input.visualMarkers;
      immutableTraits = input.immutableTraits;
      activeVersion = 1;
      createdAt = Time.now();
    };
    records.add(id, record);
    record;
  };

  public func updateDna(records : Map.Map<Types.Id, Types.DnaRecord>, id : Types.Id, input : Types.DnaInput) : ?Types.DnaRecord {
    switch (records.get(id)) {
      case null { null };
      case (?existing) {
        let updated : Types.DnaRecord = {
          id = existing.id;
          characterName = input.characterName;
          identityBlocks = input.identityBlocks;
          visualMarkers = input.visualMarkers;
          immutableTraits = input.immutableTraits;
          activeVersion = existing.activeVersion;
          createdAt = existing.createdAt;
        };
        records.add(id, updated);
        ?updated;
      };
    };
  };

  public func deleteDna(records : Map.Map<Types.Id, Types.DnaRecord>, id : Types.Id) : Bool {
    switch (records.get(id)) {
      case null { false };
      case (?_) {
        records.remove(id);
        true;
      };
    };
  };

  public func bumpDnaVersion(records : Map.Map<Types.Id, Types.DnaRecord>, id : Types.Id) : ?Types.DnaRecord {
    switch (records.get(id)) {
      case null { null };
      case (?existing) {
        let updated : Types.DnaRecord = {
          id = existing.id;
          characterName = existing.characterName;
          identityBlocks = existing.identityBlocks;
          visualMarkers = existing.visualMarkers;
          immutableTraits = existing.immutableTraits;
          activeVersion = existing.activeVersion + 1;
          createdAt = existing.createdAt;
        };
        records.add(id, updated);
        ?updated;
      };
    };
  };

  // ---- World Lore ----

  public func listLore(rules : Map.Map<Types.Id, Types.LoreRule>) : [Types.LoreRule] {
    rules.values().toArray();
  };

  public func getLore(rules : Map.Map<Types.Id, Types.LoreRule>, id : Types.Id) : ?Types.LoreRule {
    rules.get(id);
  };

  public func createLore(rules : Map.Map<Types.Id, Types.LoreRule>, nextId : { var value : Nat }, input : Types.LoreInput) : Types.LoreRule {
    let id = nextId.value;
    nextId.value := id + 1;
    let rule : Types.LoreRule = {
      id;
      ruleName = input.ruleName;
      timelineConstraints = input.timelineConstraints;
      universeBounds = input.universeBounds;
      status = #active;
      createdAt = Time.now();
    };
    rules.add(id, rule);
    rule;
  };

  public func updateLore(rules : Map.Map<Types.Id, Types.LoreRule>, id : Types.Id, input : Types.LoreInput) : ?Types.LoreRule {
    switch (rules.get(id)) {
      case null { null };
      case (?existing) {
        let updated : Types.LoreRule = {
          id = existing.id;
          ruleName = input.ruleName;
          timelineConstraints = input.timelineConstraints;
          universeBounds = input.universeBounds;
          status = existing.status;
          createdAt = existing.createdAt;
        };
        rules.add(id, updated);
        ?updated;
      };
    };
  };

  public func setLoreStatus(rules : Map.Map<Types.Id, Types.LoreRule>, id : Types.Id, status : Types.LoreStatus) : ?Types.LoreRule {
    switch (rules.get(id)) {
      case null { null };
      case (?existing) {
        let updated : Types.LoreRule = {
          id = existing.id;
          ruleName = existing.ruleName;
          timelineConstraints = existing.timelineConstraints;
          universeBounds = existing.universeBounds;
          status;
          createdAt = existing.createdAt;
        };
        rules.add(id, updated);
        ?updated;
      };
    };
  };

  public func deleteLore(rules : Map.Map<Types.Id, Types.LoreRule>, id : Types.Id) : Bool {
    switch (rules.get(id)) {
      case null { false };
      case (?_) {
        rules.remove(id);
        true;
      };
    };
  };

  // ---- Asset Ingredients ----

  public func listAssets(assets : Map.Map<Types.Id, Types.AssetIngredient>) : [Types.AssetIngredient] {
    assets.values().toArray();
  };

  public func getAsset(assets : Map.Map<Types.Id, Types.AssetIngredient>, id : Types.Id) : ?Types.AssetIngredient {
    assets.get(id);
  };

  public func createAsset(assets : Map.Map<Types.Id, Types.AssetIngredient>, nextId : { var value : Nat }, input : Types.AssetInput) : Types.AssetIngredient {
    let id = nextId.value;
    nextId.value := id + 1;
    let asset : Types.AssetIngredient = {
      id;
      fileName = input.fileName;
      fileType = input.fileType;
      storageUrl = input.storageUrl;
      tags = input.tags;
      linkedCharacterId = input.linkedCharacterId;
      createdAt = Time.now();
    };
    assets.add(id, asset);
    asset;
  };

  public func updateAsset(assets : Map.Map<Types.Id, Types.AssetIngredient>, id : Types.Id, input : Types.AssetInput) : ?Types.AssetIngredient {
    switch (assets.get(id)) {
      case null { null };
      case (?existing) {
        let updated : Types.AssetIngredient = {
          id = existing.id;
          fileName = input.fileName;
          fileType = input.fileType;
          storageUrl = input.storageUrl;
          tags = input.tags;
          linkedCharacterId = input.linkedCharacterId;
          createdAt = existing.createdAt;
        };
        assets.add(id, updated);
        ?updated;
      };
    };
  };

  public func deleteAsset(assets : Map.Map<Types.Id, Types.AssetIngredient>, id : Types.Id) : Bool {
    switch (assets.get(id)) {
      case null { false };
      case (?_) {
        assets.remove(id);
        true;
      };
    };
  };

  public func listAssetsForCharacter(assets : Map.Map<Types.Id, Types.AssetIngredient>, characterId : Types.Id) : [Types.AssetIngredient] {
    assets.values().filter(func(a) {
      switch (a.linkedCharacterId) {
        case (?cid) { cid == characterId };
        case null { false };
      };
    }).toArray();
  };
};
