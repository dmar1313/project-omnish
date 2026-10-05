import { fromEnv } "mo:caffeineai-inference-client/Config";
import ChatApi "mo:caffeineai-inference-client/Apis/ChatApi";
import ChatCompletionRequest "mo:caffeineai-inference-client/Models/ChatCompletionRequest";
import ChatCompletionRequestMessageOneOf2 "mo:caffeineai-inference-client/Models/ChatCompletionRequestMessageOneOf2";
import Runtime "mo:core/Runtime";

module {
  public type ChatResult = {
    text : Text;
    tokens : Float;
  };

  // Non-trapping probe: reports whether the platform has provisioned inference
  // credentials for this canister. `fromEnv` traps when
  // `CAFFEINE_INFERENCE_API_KEY` is unset, so the probe catches that trap and
  // reports `false` instead of propagating it. The run pipeline uses this to
  // settle to an honest terminal error deterministically, rather than relying
  // on catching a trap raised from deep inside an awaited call.
  //
  // `try` in Motoko only wraps an async expression, so the probe is async and
  // awaits the config construction inside the `try` block.
  public func isAvailable<system>() : async Bool {
    try {
      ignore await async fromEnv<system>();
      true;
    } catch (_) {
      false;
    };
  };

  public func runChat<system>(prompt : Text) : async* ChatResult {
    let config = fromEnv<system>();
    let userMessage = ChatCompletionRequestMessageOneOf2.JSON.init({
      content = #string(prompt);
      role = #user;
    });
    let req = ChatCompletionRequest.JSON.init({
      messages = [#user(userMessage)];
      model = "router";
    });
    let resp = await* ChatApi.createChatCompletion(config, req);
    if (resp.choices.size() == 0) {
      Runtime.trap("Inference returned no choices");
    };
    let text = resp.choices[0].message.content
      ?? Runtime.trap("Inference returned no text content");
    let tokens = switch (resp.usage) {
      case (?u) {
        let total = switch (u.total_tokens) {
          case (?t) { t };
          case null { u.prompt_tokens + u.completion_tokens };
        };
        total.toFloat();
      };
      case null { 0.0 };
    };
    { text; tokens };
  };
};
