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
})();
