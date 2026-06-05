(function () {
  const ROOT_CLASS = "tvtc-vertical-theater";
  const DEBUG_CLASS = "tvtc-debug";
  const PLAYER_CLASS = "tvtc-player";
  const CHAT_CLASS = "tvtc-chat";
  const FS_CLASS = "tvtc-fs";
  const CONTROLS_CLASS = "tvtc-controls";
  const POSITION_BUTTON_CLASS = "tvtc-position-action";
  const VISIBILITY_BUTTON_CLASS = "tvtc-visibility-action";
  const POSITION_KEY = "tvtc-chat-position";
  const HIDDEN_KEY = "tvtc-chat-hidden-v2";
  let scheduled = false;
  let theaterSessionActive = false;
  let theaterIntentUntil = 0;
  let suppressTheaterUntil = 0;

  const TVTC_DEBUG = true;
  function dlog() {
    if (!TVTC_DEBUG) return;
    const args = ["[TVTC " + performance.now().toFixed(0) + "ms]"];
    for (let i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.log.apply(console, args);
  }
  function describeEl(el) {
    if (!el) return null;
    return el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 4).join(".") : "");
  }
  dlog("script loaded");

  localStorage.removeItem("tvtc-chat-hidden");

  function clamp(min, value, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getChatPosition() {
    return localStorage.getItem(POSITION_KEY) === "top" ? "top" : "bottom";
  }

  function setChatPosition(position) {
    localStorage.setItem(POSITION_KEY, position);
    scheduleUpdate(true);
  }

  function isChatHidden() {
    return localStorage.getItem(HIDDEN_KEY) === "true";
  }

  function isEffectiveChatHidden() {
    return isChatHidden() || isNativeChatCollapsed();
  }

  function setChatHidden(hidden) {
    localStorage.setItem(HIDDEN_KEY, hidden ? "true" : "false");
    if (!hidden) clickNativeChatExpand();
    scheduleUpdate(true);
    window.setTimeout(() => scheduleUpdate(true), 150);
  }

  function isWatchPage() {
    const path = window.location.pathname;
    return path.length > 1 && !path.startsWith("/directory") && !path.startsWith("/videos");
  }

  function isVerticalLayout() {
    return window.innerHeight >= window.innerWidth || window.innerWidth <= 820;
  }

  function getVideoPlayer() {
    return document.querySelector('[data-a-target="video-player"]');
  }

  function hasChatContent() {
    return Boolean(
      document.querySelector('[data-a-target="right-column-chat-bar"]') ||
        document.querySelector('[data-test-selector="chat-room-component-layout"]')
    );
  }

  function findChatNode() {
    const chatBar = document.querySelector('[data-a-target="right-column-chat-bar"]');
    const chatLayout = document.querySelector('[data-test-selector="chat-room-component-layout"]');
    return document.querySelector(".channel-root__right-column") || (chatBar && chatBar.parentElement) || (chatLayout && chatLayout.parentElement);
  }

  function findNativeChatButton(kind) {
    const pattern = kind === "expand" ? /(expand|show)\s+chat|chat\s+(expand|show)/i : /(collapse|hide)\s+chat|chat\s+(collapse|hide)/i;
    return Array.from(document.querySelectorAll("button[aria-label]")).find((button) => {
      return !button.classList.contains("tvtc-icon-button") && pattern.test(button.getAttribute("aria-label") || "");
    });
  }

  function isNativeChatCollapsed() {
    const chat = findChatNode();
    const chatClass = (chat && chat.className) || "";
    return Boolean(!chat || (/\bcollapsed\b/i.test(chatClass) && !hasChatContent()));
  }

  function isTheaterMode() {
    const theaterButton = document.querySelector('[data-a-target="player-theatre-mode-button"]');
    const label = (theaterButton && theaterButton.getAttribute("aria-label")) || "";
    const pressed = theaterButton && theaterButton.getAttribute("aria-pressed") === "true";

    return (
      pressed ||
      /exit (theatre|theater) mode/i.test(label) ||
      Boolean(document.querySelector(".persistent-player--theatre")) ||
      Boolean(document.querySelector(".channel-root--theatre"))
    );
  }

  function isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function isActiveLayout() {
    if (isFullscreen()) return false;
    return isWatchPage() && isVerticalLayout() && Date.now() >= suppressTheaterUntil && (isTheaterMode() || theaterSessionActive || Date.now() < theaterIntentUntil) && Boolean(getVideoPlayer());
  }

  function markLayoutNodes() {
    const videoPlayer = getVideoPlayer();
    const player = findPlayerWrapper(videoPlayer) || videoPlayer;
    const chat = findChatNode();

    document.querySelectorAll("." + PLAYER_CLASS).forEach((node) => {
      if (node !== player) node.classList.remove(PLAYER_CLASS);
    });
    document.querySelectorAll("." + CHAT_CLASS).forEach((node) => {
      if (node !== chat) node.classList.remove(CHAT_CLASS);
    });

    if (player && !player.classList.contains(PLAYER_CLASS)) player.classList.add(PLAYER_CLASS);
    if (chat && !chat.classList.contains(CHAT_CLASS)) chat.classList.add(CHAT_CLASS);
  }

  function findPlayerWrapper(videoPlayer) {
    if (!videoPlayer) return null;
    return videoPlayer.closest(".persistent-player") || videoPlayer.closest(".channel-root__player") || videoPlayer.parentElement;
  }

  function updateLayoutVars() {
    const availableHeight = Math.max(360, window.innerHeight);
    const availableWidth = Math.max(320, window.innerWidth);
    const hidden = isEffectiveChatHidden();
    let playerHeight = availableHeight;
    let chatHeight = 0;

    if (!hidden) {
      const minChatHeight = clamp(260, availableHeight * 0.28, 460);
      const maxPlayerHeight = Math.max(240, availableHeight - minChatHeight);
      const naturalPlayerHeight = availableWidth * 9 / 16;
      playerHeight = Math.round(clamp(240, naturalPlayerHeight, maxPlayerHeight));
      chatHeight = Math.round(Math.max(220, availableHeight - playerHeight));
    }

    const chatPosition = getChatPosition();
    const playerTop = hidden ? Math.round((availableHeight - playerHeight) / 2) : (chatPosition === "top" ? chatHeight : 0);
    const style = document.documentElement.style;

    style.setProperty("--tvtc-player-top", playerTop + "px");
    style.setProperty("--tvtc-player-height", Math.round(playerHeight) + "px");
    style.setProperty("--tvtc-chat-height", Math.round(chatHeight) + "px");
    document.documentElement.dataset.tvtcChatPosition = chatPosition;
    document.documentElement.dataset.tvtcChatHidden = hidden ? "true" : "false";
  }

  function clickNativeChatExpand() {
    const selectors = [
      '[data-a-target="right-column__toggle-expand-btn"]',
      '[data-a-target="right-column__toggle-visibility-btn"]',
      'button[aria-label="Expand Chat"]',
      'button[aria-label="Expand chat"]',
      'button[aria-label="Show Chat"]',
      'button[aria-label="Show chat"]'
    ];
    const button = findNativeChatButton("expand") || selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    if (button) button.click();
  }

  function iconSvg(name) {
    const icons = {
      up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l-6 6h4v8h4v-8h4l-6-6z"/><path d="M5 4h14"/></svg>',
      down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19l6-6h-4V5h-4v8H6l6 6z"/><path d="M5 20h14"/></svg>',
      hide: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H8l-3 3V5z"/><path d="M4 21L20 3"/></svg>',
      show: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H8l-3 3V5z"/><path d="M8 9h8"/><path d="M8 12h5"/></svg>'
    };
    return icons[name];
  }

  function ensureButton(container, className) {
    let button = container.querySelector("." + className);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "tvtc-icon-button " + className;
      container.appendChild(button);
    }
    return button;
  }

  function updateButton(button, iconName, label, onClick) {
    if (button.dataset.tvtcIcon !== iconName) {
      button.innerHTML = iconSvg(iconName);
      button.dataset.tvtcIcon = iconName;
    }

    button.title = label;
    button.setAttribute("aria-label", label);
    button.onclick = onClick;
  }

  function ensureControls(active) {
    let controls = document.querySelector("." + CONTROLS_CLASS);

    if (!active) {
      if (controls) controls.remove();
      return;
    }

    if (!controls) {
      controls = document.createElement("div");
      controls.className = CONTROLS_CLASS;
      document.body.appendChild(controls);
    }

    const positionButton = ensureButton(controls, POSITION_BUTTON_CLASS);
    const visibilityButton = ensureButton(controls, VISIBILITY_BUTTON_CLASS);
    const nextPosition = getChatPosition() === "top" ? "bottom" : "top";
    const hidden = isEffectiveChatHidden();

    updateButton(positionButton, nextPosition === "top" ? "up" : "down", "Move chat to " + nextPosition, (event) => {
      event.preventDefault();
      event.stopPropagation();
      setChatPosition(nextPosition);
    });

    updateButton(visibilityButton, hidden ? "show" : "hide", hidden ? "Show chat" : "Hide chat", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setChatHidden(!hidden);
    });
  }

  let fullscreenPendingTimer = null;
  function setFullscreenClass(on) {
    const had = document.documentElement.classList.contains(FS_CLASS);
    if (had === on) return;
    document.documentElement.classList.toggle(FS_CLASS, on);
    dlog("setFullscreenClass", { on: on });
  }
  function markFullscreenPending() {
    dlog("markFullscreenPending");
    setFullscreenClass(true);
    if (fullscreenPendingTimer) clearTimeout(fullscreenPendingTimer);
    fullscreenPendingTimer = window.setTimeout(function () {
      fullscreenPendingTimer = null;
      if (!isFullscreen()) {
        dlog("fullscreen pending timeout fired, request never landed");
        setFullscreenClass(false);
      }
    }, 300);
  }
  function isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function deactivateLayout() {
    dlog("deactivateLayout called", { hadRoot: document.documentElement.classList.contains(ROOT_CLASS) });
    document.documentElement.classList.remove(ROOT_CLASS);
    document.querySelectorAll("." + PLAYER_CLASS).forEach((node) => node.classList.remove(PLAYER_CLASS));
    document.querySelectorAll("." + CHAT_CLASS).forEach((node) => node.classList.remove(CHAT_CLASS));
    const controls = document.querySelector("." + CONTROLS_CLASS);
    if (controls) controls.remove();
    const style = document.documentElement.style;
    style.removeProperty("--tvtc-player-top");
    style.removeProperty("--tvtc-player-height");
    style.removeProperty("--tvtc-chat-height");
    delete document.documentElement.dataset.tvtcChatPosition;
    delete document.documentElement.dataset.tvtcChatHidden;
  }

  function update() {
    scheduled = false;
    const fs = isFullscreen();
    if (fs) {
      dlog("update: SKIPPED (fullscreen)", { fsEl: describeEl(document.fullscreenElement) });
      return;
    }
    markLayoutNodes();
    if (!isWatchPage() || !isVerticalLayout()) theaterSessionActive = false;
    const theaterActive = isTheaterMode();
    if (Date.now() >= suppressTheaterUntil) {
      theaterSessionActive = theaterActive;
    }
    const active = isActiveLayout();
    const wasActive = document.documentElement.classList.contains(ROOT_CLASS);
    if (wasActive !== active) {
      dlog("ROOT_CLASS toggle", { from: wasActive, to: active, theater: theaterActive, session: theaterSessionActive, vertical: isVerticalLayout(), suppressed: Date.now() < suppressTheaterUntil });
    }
    document.documentElement.classList.toggle(ROOT_CLASS, active);

    if (active) {
      updateLayoutVars();
    }

    ensureControls(active);

    if (document.documentElement.classList.contains(DEBUG_CLASS)) {
      document.documentElement.dataset.tvtcState = JSON.stringify({
        active,
        vertical: isVerticalLayout(),
        theater: isTheaterMode(),
        chat: Boolean(findChatNode()),
        hidden: isEffectiveChatHidden(),
        position: getChatPosition(),
        width: window.innerWidth,
        height: window.innerHeight
      });
    }
  }

  function scheduleUpdate(force) {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  function handleDocumentPointerDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const fullscreenButton = target.closest('[data-a-target="player-fullscreen-button"]');
    if (fullscreenButton && !isFullscreen()) {
      markFullscreenPending();
      return;
    }

    const theaterButton = target.closest('[data-a-target="player-theatre-mode-button"]');
    if (theaterButton) {
      const label = theaterButton.getAttribute("aria-label") || "";
      const layoutActive = document.documentElement.classList.contains(ROOT_CLASS);
      const isExiting = /exit (theatre|theater) mode/i.test(label) || layoutActive;
      theaterSessionActive = !isExiting;
      if (theaterSessionActive) {
        theaterIntentUntil = Date.now() + 2500;
        suppressTheaterUntil = 0;
      } else {
        theaterIntentUntil = 0;
        suppressTheaterUntil = Date.now() + 1200;
      }
      scheduleUpdate(true);
      window.setTimeout(() => scheduleUpdate(true), 0);
      window.setTimeout(() => scheduleUpdate(true), 16);
      window.setTimeout(() => scheduleUpdate(true), 80);
      window.setTimeout(() => scheduleUpdate(true), 300);
      return;
    }

    const labelledButton = target.closest("button[aria-label]");
    const label = labelledButton && labelledButton.getAttribute("aria-label");
    if (label && /(expand|show|collapse|hide)\s+chat|chat\s+(expand|show|collapse|hide)/i.test(label)) {
      window.setTimeout(() => scheduleUpdate(true), 120);
    }
  }

  function handleDocumentKeyDown(event) {
    if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey && !isInputFocused() && !isFullscreen()) {
      markFullscreenPending();
      return;
    }
    if (event.key !== "Escape") return;
    theaterSessionActive = false;
    theaterIntentUntil = 0;
    suppressTheaterUntil = Date.now() + 1200;
    window.setTimeout(() => scheduleUpdate(true), 0);
    window.setTimeout(() => scheduleUpdate(true), 120);
  }

  function handleDocumentDblClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (isFullscreen()) return;
    if (target.closest("button")) return;
    if (target.closest('[data-a-target="video-player"]')) {
      markFullscreenPending();
    }
  }

  function isIgnoredMutation(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (!target) return false;

    return Boolean(
      target.closest("." + PLAYER_CLASS) ||
        target.closest("." + CHAT_CLASS) ||
        target.closest("." + CONTROLS_CLASS) ||
        target.closest('[data-a-target="video-player"]')
    );
  }

  function selectorSummary(element) {
    if (!element) return null;
    const className = typeof element.className === "string" ? element.className : "";
    return {
      tag: element.tagName,
      id: element.id || "",
      className,
      dataTarget: element.getAttribute("data-a-target") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      src: element.getAttribute("src") || "",
      pointerEvents: getComputedStyle(element).pointerEvents,
      position: getComputedStyle(element).position
    };
  }

  function buildDiagnostic() {
    const player = document.querySelector("." + PLAYER_CLASS) || getVideoPlayer();
    const rect = player && player.getBoundingClientRect();
    const points = rect
      ? [
          ["topRight", rect.right - 8, rect.top + 8],
          ["bottomRight", rect.right - 8, rect.bottom - 8],
          ["controlsRight", rect.right - 70, rect.bottom - 35],
          ["controlsBottomRight", rect.right - 20, rect.bottom - 35]
        ]
      : [];

    return {
      rootClass: document.documentElement.className,
      rootDataset: { ...document.documentElement.dataset },
      player: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      chat: selectorSummary(document.querySelector("." + CHAT_CLASS)),
      hits: points.map(([name, x, y]) => {
        const cx = Math.max(0, Math.min(window.innerWidth - 1, x));
        const cy = Math.max(0, Math.min(window.innerHeight - 1, y));
        return {
          name,
          x: cx,
          y: cy,
          stack: document.elementsFromPoint(cx, cy).slice(0, 12).map(selectorSummary)
        };
      })
    };
  }

  function installDiagnosticBridge() {
    document.addEventListener("tvtc:diagnose", () => {
      document.documentElement.setAttribute("data-tvtc-diagnostic", JSON.stringify(buildDiagnostic()));
    });

    const script = document.createElement("script");
    script.textContent = [
      "window.tvtcDiagnose = function () {",
      "  document.dispatchEvent(new CustomEvent('tvtc:diagnose'));",
      "  return JSON.parse(document.documentElement.getAttribute('data-tvtc-diagnostic') || '{}');",
      "};"
    ].join("\n");
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  const observer = new MutationObserver((mutations) => {
    if (isFullscreen()) return;
    if (mutations.length && mutations.every(isIgnoredMutation)) return;
    scheduleUpdate(false);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("keydown", handleDocumentKeyDown, true);
  document.addEventListener("dblclick", handleDocumentDblClick, true);
  function handleFullscreenChange() {
    dlog("fullscreenchange", {
      fsEl: describeEl(document.fullscreenElement),
      webkitFsEl: describeEl(document.webkitFullscreenElement),
      isFs: isFullscreen(),
      rootClass: document.documentElement.classList.contains(ROOT_CLASS),
      fsClass: document.documentElement.classList.contains(FS_CLASS)
    });
    if (fullscreenPendingTimer) {
      clearTimeout(fullscreenPendingTimer);
      fullscreenPendingTimer = null;
    }
    if (isFullscreen()) {
      setFullscreenClass(true);
      deactivateLayout();
      return;
    }
    setFullscreenClass(false);
    theaterIntentUntil = Date.now() + 2500;
    suppressTheaterUntil = 0;
    scheduleUpdate(true);
    window.setTimeout(() => scheduleUpdate(true), 80);
    window.setTimeout(() => scheduleUpdate(true), 300);
  }
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  window.addEventListener("resize", () => scheduleUpdate(true), { passive: true });
  window.addEventListener("orientationchange", () => scheduleUpdate(true), { passive: true });
  window.addEventListener("popstate", () => scheduleUpdate(true));
  window.setInterval(() => {
    if (isFullscreen()) return;
    if (!document.documentElement.classList.contains(ROOT_CLASS)) scheduleUpdate(false);
  }, 1000);

  const pushState = history.pushState;
  const replaceState = history.replaceState;

  history.pushState = function () {
    const result = pushState.apply(this, arguments);
    scheduleUpdate(true);
    return result;
  };

  history.replaceState = function () {
    const result = replaceState.apply(this, arguments);
    scheduleUpdate(true);
    return result;
  };

  installDiagnosticBridge();
  scheduleUpdate(true);
})();
