(function () {
  if (window.__tvtcFsHookInstalled) return;
  window.__tvtcFsHookInstalled = true;

  function fire(name) {
    try {
      document.dispatchEvent(new CustomEvent(name));
    } catch (e) {}
  }

  const proto = Element.prototype;

  if (typeof proto.requestFullscreen === "function") {
    const orig = proto.requestFullscreen;
    proto.requestFullscreen = function () {
      fire("tvtc:fs-request");
      let result;
      try {
        result = orig.apply(this, arguments);
      } catch (e) {
        fire("tvtc:fs-request-failed");
        throw e;
      }
      if (result && typeof result.then === "function") {
        result.then(undefined, function () { fire("tvtc:fs-request-failed"); });
      }
      return result;
    };
  }

  if (typeof proto.webkitRequestFullscreen === "function") {
    const origWebkit = proto.webkitRequestFullscreen;
    proto.webkitRequestFullscreen = function () {
      fire("tvtc:fs-request");
      try {
        return origWebkit.apply(this, arguments);
      } catch (e) {
        fire("tvtc:fs-request-failed");
        throw e;
      }
    };
  }
})();
