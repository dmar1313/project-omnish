import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/studio";
import StudioLib "../lib/studio";

mixin (
  accessControlState : AccessControl.AccessControlState,
  dna : Map.Map<Types.Id, Types.DnaRecord>,
  lore : Map.Map<Types.Id, Types.LoreRule>,
  assets : Map.Map<Types.Id, Types.AssetIngredient>,
  nextDnaId : { var value : Nat },
  nextLoreId : { var value : Nat },
  nextAssetId : { var value : Nat },
) {
  func requireUser(caller : Principal) {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only signed-in users can perform this action");
    };
  };

  // ---- Prompt DNA Registry ----

  public query ({ caller }) func listDna() : async [Types.DnaRecord] {
    requireUser(caller);
    StudioLib.listDna(dna);
  };

  public query ({ caller }) func getDna(id : Types.Id) : async ?Types.DnaRecord {
    requireUser(caller);
    StudioLib.getDna(dna, id);
  };

  public shared ({ caller }) func createDna(input : Types.DnaInput) : async Types.DnaRecord {
    requireUser(caller);
    StudioLib.createDna(dna, nextDnaId, input);
  };

  public shared ({ caller }) func updateDna(id : Types.Id, input : Types.DnaInput) : async ?Types.DnaRecord {
    requireUser(caller);
    StudioLib.updateDna(dna, id, input);
  };

  public shared ({ caller }) func deleteDna(id : Types.Id) : async Bool {
    requireUser(caller);
    StudioLib.deleteDna(dna, id);
  };

  public shared ({ caller }) func bumpDnaVersion(id : Types.Id) : async ?Types.DnaRecord {
    requireUser(caller);
    StudioLib.bumpDnaVersion(dna, id);
  };

  // ---- World Lore ----

  public query ({ caller }) func listLore() : async [Types.LoreRule] {
    requireUser(caller);
    StudioLib.listLore(lore);
  };

  public query ({ caller }) func getLore(id : Types.Id) : async ?Types.LoreRule {
    requireUser(caller);
    StudioLib.getLore(lore, id);
  };

  public shared ({ caller }) func createLore(input : Types.LoreInput) : async Types.LoreRule {
    requireUser(caller);
    StudioLib.createLore(lore, nextLoreId, input);
  };

  public shared ({ caller }) func updateLore(id : Types.Id, input : Types.LoreInput) : async ?Types.LoreRule {
    requireUser(caller);
    StudioLib.updateLore(lore, id, input);
  };

  public shared ({ caller }) func setLoreStatus(id : Types.Id, status : Types.LoreStatus) : async ?Types.LoreRule {
    requireUser(caller);
    StudioLib.setLoreStatus(lore, id, status);
  };

  public shared ({ caller }) func deleteLore(id : Types.Id) : async Bool {
    requireUser(caller);
    StudioLib.deleteLore(lore, id);
  };

  // ---- Asset Ingredients ----

  public query ({ caller }) func listAssets() : async [Types.AssetIngredient] {
    requireUser(caller);
    StudioLib.listAssets(assets);
  };

  public query ({ caller }) func getAsset(id : Types.Id) : async ?Types.AssetIngredient {
    requireUser(caller);
    StudioLib.getAsset(assets, id);
  };

  public shared ({ caller }) func createAsset(input : Types.AssetInput) : async Types.AssetIngredient {
    requireUser(caller);
    StudioLib.createAsset(assets, nextAssetId, input);
  };

  public shared ({ caller }) func updateAsset(id : Types.Id, input : Types.AssetInput) : async ?Types.AssetIngredient {
    requireUser(caller);
    StudioLib.updateAsset(assets, id, input);
  };

  public shared ({ caller }) func deleteAsset(id : Types.Id) : async Bool {
    requireUser(caller);
    StudioLib.deleteAsset(assets, id);
  };

  public query ({ caller }) func listAssetsForCharacter(characterId : Types.Id) : async [Types.AssetIngredient] {
    requireUser(caller);
    StudioLib.listAssetsForCharacter(assets, characterId);
  };
};
