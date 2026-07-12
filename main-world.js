(function () {
  if (window.__tvtcFsHookInstalled) return;
  window.__tvtcFsHookInstalled = true;

  function fire(name) {
    document.dispatchEvent(new CustomEvent(name));
  }

  function wrap(proto, methodName, isPromiseBased) {
    const original = proto[methodName];
    if (typeof original !== "function") return;

    proto[methodName] = function () {
      fire("tvtc:fs-request");
      let result;
      try {
        result = original.apply(this, arguments);
      } catch (error) {
        fire("tvtc:fs-request-failed");
        throw error;
      }
      if (isPromiseBased && result && typeof result.then === "function") {
        result.then(undefined, () => fire("tvtc:fs-request-failed"));
      }
      return result;
    };
  }

  wrap(Element.prototype, "requestFullscreen", true);
  wrap(Element.prototype, "webkitRequestFullscreen", false);

  // Twitch is an SPA — page-initiated history changes only happen in this
  // world, so the navigation signal must be hooked here and relayed to the
  // content script as a DOM event (same pattern as the fullscreen hooks).
  function wrapHistory(methodName) {
    const original = history[methodName];
    if (typeof original !== "function") return;

    history[methodName] = function () {
      const result = original.apply(this, arguments);
      fire("tvtc:nav");
      return result;
    };
  }

  wrapHistory("pushState");
  wrapHistory("replaceState");
})();
