import Map "mo:core/Map";
import Time "mo:core/Time";
import Types "../types/cameo";

module {
  // A session is complete once all three photos and the voice sample are set.
  func isComplete(input : Types.CameoInput) : Bool {
    switch (input.frontAssetId, input.leftAssetId, input.rightAssetId, input.voiceAssetId) {
      case (?_, ?_, ?_, ?_) { true };
      case _ { false };
    };
  };

  public func listCameos(captures : Map.Map<Types.Id, Types.CameoCapture>) : [Types.CameoCapture] {
    captures.values().toArray();
  };

  public func getCameo(captures : Map.Map<Types.Id, Types.CameoCapture>, id : Types.Id) : ?Types.CameoCapture {
    captures.get(id);
  };

  public func createCameo(captures : Map.Map<Types.Id, Types.CameoCapture>, nextId : { var value : Nat }, input : Types.CameoInput) : Types.CameoCapture {
    let id = nextId.value;
    nextId.value := id + 1;
    let capture : Types.CameoCapture = {
      id;
      characterId = input.characterId;
      frontAssetId = input.frontAssetId;
      leftAssetId = input.leftAssetId;
      rightAssetId = input.rightAssetId;
      voiceAssetId = input.voiceAssetId;
      status = if (isComplete(input)) { #complete } else { #draft };
      createdAt = Time.now();
    };
    captures.add(id, capture);
    capture;
  };

  public func updateCameo(captures : Map.Map<Types.Id, Types.CameoCapture>, id : Types.Id, input : Types.CameoInput) : ?Types.CameoCapture {
    switch (captures.get(id)) {
      case null { null };
      case (?existing) {
        let updated : Types.CameoCapture = {
          id = existing.id;
          characterId = input.characterId;
          frontAssetId = input.frontAssetId;
          leftAssetId = input.leftAssetId;
          rightAssetId = input.rightAssetId;
          voiceAssetId = input.voiceAssetId;
          status = if (isComplete(input)) { #complete } else { #draft };
          createdAt = existing.createdAt;
        };
        captures.add(id, updated);
        ?updated;
      };
    };
  };

  public func deleteCameo(captures : Map.Map<Types.Id, Types.CameoCapture>, id : Types.Id) : Bool {
    switch (captures.get(id)) {
      case null { false };
      case (?_) {
        captures.remove(id);
        true;
      };
    };
  };

  public func listCameosForCharacter(captures : Map.Map<Types.Id, Types.CameoCapture>, characterId : Types.Id) : [Types.CameoCapture] {
    captures.values().filter(func(c) { c.characterId == characterId }).toArray();
  };
};
