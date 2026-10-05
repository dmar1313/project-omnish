import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/cameo";
import CameoLib "../lib/cameo";

mixin (
  accessControlState : AccessControl.AccessControlState,
  cameos : Map.Map<Types.Id, Types.CameoCapture>,
  nextCameoId : { var value : Nat },
) {
  func requireCameoUser(caller : Principal) {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only signed-in users can perform this action");
    };
  };

  // ---- Guided camera cameo capture ----

  public query ({ caller }) func listCameos() : async [Types.CameoCapture] {
    requireCameoUser(caller);
    CameoLib.listCameos(cameos);
  };

  public query ({ caller }) func getCameo(id : Types.Id) : async ?Types.CameoCapture {
    requireCameoUser(caller);
    CameoLib.getCameo(cameos, id);
  };

  public shared ({ caller }) func createCameo(input : Types.CameoInput) : async Types.CameoCapture {
    requireCameoUser(caller);
    CameoLib.createCameo(cameos, nextCameoId, input);
  };

  public shared ({ caller }) func updateCameo(id : Types.Id, input : Types.CameoInput) : async ?Types.CameoCapture {
    requireCameoUser(caller);
    CameoLib.updateCameo(cameos, id, input);
  };

  public shared ({ caller }) func deleteCameo(id : Types.Id) : async Bool {
    requireCameoUser(caller);
    CameoLib.deleteCameo(cameos, id);
  };

  public query ({ caller }) func listCameosForCharacter(characterId : Types.Id) : async [Types.CameoCapture] {
    requireCameoUser(caller);
    CameoLib.listCameosForCharacter(cameos, characterId);
  };
};
