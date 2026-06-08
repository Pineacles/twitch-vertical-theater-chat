(function () {
  const ROOT_CLASS = "tvtc-vertical-theater";
  const PLAYER_CLASS = "tvtc-player";
  const CHAT_CLASS = "tvtc-chat";
  const FS_CLASS = "tvtc-fs";
  const CONTROLS_CLASS = "tvtc-controls";
  const ICON_BUTTON_CLASS = "tvtc-icon-button";
  const POSITION_BUTTON_CLASS = "tvtc-position-action";
  const VISIBILITY_BUTTON_CLASS = "tvtc-visibility-action";

  const POSITION_KEY = "tvtc-chat-position";
  const HIDDEN_KEY = "tvtc-chat-hidden-v2";

  const VERTICAL_BREAKPOINT_PX = 820;
  const THEATER_INTENT_MS = 2500;
  const SUPPRESS_THEATER_MS = 1200;
  const FULLSCREEN_FAILSAFE_MS = 1500;
  const POST_ACTION_REFRESH_MS = [0, 16, 80, 300];
  const IDLE_REFRESH_INTERVAL_MS = 1000;
  const MIN_PLAYER_HEIGHT_PX = 240;
  const MIN_CHAT_HEIGHT_PX = 220;

  const EXPAND_BUTTON_PATTERN = /(expand|show)\s+chat|chat\s+(expand|show)/i;
  const COLLAPSE_BUTTON_PATTERN = /(collapse|hide)\s+chat|chat\s+(collapse|hide)/i;
  const CHAT_BUTTON_PATTERN = /(expand|show|collapse|hide)\s+chat|chat\s+(expand|show|collapse|hide)/i;
  const EXIT_THEATER_PATTERN = /exit (theatre|theater) mode/i;

  const EXPAND_BUTTON_SELECTORS = [
    '[data-a-target="right-column__toggle-expand-btn"]',
    '[data-a-target="right-column__toggle-visibility-btn"]',
    'button[aria-label="Expand Chat"]',
    'button[aria-label="Expand chat"]',
    'button[aria-label="Show Chat"]',
    'button[aria-label="Show chat"]'
  ];

  let scheduled = false;
  let theaterSessionActive = false;
  let theaterIntentUntil = 0;
  let suppressTheaterUntil = 0;
  let fullscreenPendingTimer = null;

  function clamp(min, value, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getChatPosition() {
    return localStorage.getItem(POSITION_KEY) === "top" ? "top" : "bottom";
  }

  function setChatPosition(position) {
    localStorage.setItem(POSITION_KEY, position);
    scheduleUpdate();
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
    scheduleUpdate();
    window.setTimeout(scheduleUpdate, 150);
  }

  function isWatchPage() {
    const path = window.location.pathname;
    return path.length > 1 && !path.startsWith("/directory") && !path.startsWith("/videos");
  }

  function isVerticalLayout() {
    return window.innerHeight >= window.innerWidth || window.innerWidth <= VERTICAL_BREAKPOINT_PX;
  }

  function getVideoPlayer() {
    return document.querySelector('[data-a-target="video-player"]');
  }

  function findPlayerWrapper(videoPlayer) {
    if (!videoPlayer) return null;
    return videoPlayer.closest(".persistent-player") || videoPlayer.closest(".channel-root__player") || videoPlayer.parentElement;
  }

  function findChatNode() {
    const chatBar = document.querySelector('[data-a-target="right-column-chat-bar"]');
    const chatLayout = document.querySelector('[data-test-selector="chat-room-component-layout"]');
    return document.querySelector(".channel-root__right-column") || (chatBar && chatBar.parentElement) || (chatLayout && chatLayout.parentElement);
  }

  function findNativeChatButton(kind) {
    const pattern = kind === "expand" ? EXPAND_BUTTON_PATTERN : COLLAPSE_BUTTON_PATTERN;
    return Array.from(document.querySelectorAll("button[aria-label]")).find((button) => {
      return !button.classList.contains(ICON_BUTTON_CLASS) && pattern.test(button.getAttribute("aria-label") || "");
    });
  }

  function isNativeChatCollapsed() {
    if (!findChatNode()) return true;
    return Boolean(findNativeChatButton("expand"));
  }

  function clickNativeChatExpand() {
    const button = findNativeChatButton("expand") || EXPAND_BUTTON_SELECTORS
      .map((selector) => document.querySelector(selector))
      .find((element) => element && !element.classList.contains(ICON_BUTTON_CLASS));
    if (button) button.click();
  }

  function isTheaterMode() {
    const theaterButton = document.querySelector('[data-a-target="player-theatre-mode-button"]');
    const label = (theaterButton && theaterButton.getAttribute("aria-label")) || "";
    const pressed = theaterButton && theaterButton.getAttribute("aria-pressed") === "true";

    return (
      pressed ||
      EXIT_THEATER_PATTERN.test(label) ||
      Boolean(document.querySelector(".persistent-player--theatre")) ||
      Boolean(document.querySelector(".channel-root--theatre"))
    );
  }

  function isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function isActiveLayout() {
    if (isFullscreen()) return false;
    if (!isWatchPage() || !isVerticalLayout()) return false;
    if (Date.now() < suppressTheaterUntil) return false;
    if (!isTheaterMode() && !theaterSessionActive && Date.now() >= theaterIntentUntil) return false;
    return Boolean(getVideoPlayer());
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

  function updateLayoutVars() {
    const availableHeight = Math.max(360, window.innerHeight);
    const availableWidth = Math.max(320, window.innerWidth);
    const hidden = isEffectiveChatHidden();
    let playerHeight = availableHeight;
    let chatHeight = 0;

    if (!hidden) {
      const minChatHeight = clamp(260, availableHeight * 0.28, 460);
      const maxPlayerHeight = Math.max(MIN_PLAYER_HEIGHT_PX, availableHeight - minChatHeight);
      const naturalPlayerHeight = availableWidth * 9 / 16;
      playerHeight = Math.round(clamp(MIN_PLAYER_HEIGHT_PX, naturalPlayerHeight, maxPlayerHeight));
      chatHeight = Math.round(Math.max(MIN_CHAT_HEIGHT_PX, availableHeight - playerHeight));
    }

    const chatPosition = getChatPosition();
    const playerTop = hidden
      ? Math.round((availableHeight - playerHeight) / 2)
      : (chatPosition === "top" ? chatHeight : 0);

    const style = document.documentElement.style;
    style.setProperty("--tvtc-player-top", playerTop + "px");
    style.setProperty("--tvtc-player-height", playerHeight + "px");
    style.setProperty("--tvtc-chat-height", chatHeight + "px");
    document.documentElement.dataset.tvtcChatPosition = chatPosition;
    document.documentElement.dataset.tvtcChatHidden = hidden ? "true" : "false";
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
      button.className = ICON_BUTTON_CLASS + " " + className;
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

  function setFullscreenClass(on) {
    document.documentElement.classList.toggle(FS_CLASS, on);
  }

  function clearFullscreenPendingTimer() {
    if (fullscreenPendingTimer) {
      clearTimeout(fullscreenPendingTimer);
      fullscreenPendingTimer = null;
    }
  }

  function markFullscreenPending() {
    setFullscreenClass(true);
    clearFullscreenPendingTimer();
    fullscreenPendingTimer = window.setTimeout(() => {
      fullscreenPendingTimer = null;
      if (!isFullscreen()) setFullscreenClass(false);
    }, FULLSCREEN_FAILSAFE_MS);
  }

  function update() {
    scheduled = false;
    if (isFullscreen()) return;

    markLayoutNodes();

    if (!isWatchPage() || !isVerticalLayout()) theaterSessionActive = false;
    if (Date.now() >= suppressTheaterUntil) theaterSessionActive = isTheaterMode();

    const active = isActiveLayout();
    document.documentElement.classList.toggle(ROOT_CLASS, active);

    if (active) updateLayoutVars();
    ensureControls(active);
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  function scheduleUpdateBurst() {
    scheduleUpdate();
    POST_ACTION_REFRESH_MS.forEach((ms) => window.setTimeout(scheduleUpdate, ms));
  }

  function handleDocumentPointerDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const theaterButton = target.closest('[data-a-target="player-theatre-mode-button"]');
    if (theaterButton) {
      const label = theaterButton.getAttribute("aria-label") || "";
      const layoutActive = document.documentElement.classList.contains(ROOT_CLASS);
      const isExiting = EXIT_THEATER_PATTERN.test(label) || layoutActive;
      theaterSessionActive = !isExiting;
      if (theaterSessionActive) {
        theaterIntentUntil = Date.now() + THEATER_INTENT_MS;
        suppressTheaterUntil = 0;
      } else {
        theaterIntentUntil = 0;
        suppressTheaterUntil = Date.now() + SUPPRESS_THEATER_MS;
      }
      scheduleUpdateBurst();
      return;
    }

    const labelledButton = target.closest("button[aria-label]");
    const label = labelledButton && labelledButton.getAttribute("aria-label");
    if (label && CHAT_BUTTON_PATTERN.test(label)) {
      window.setTimeout(scheduleUpdate, 120);
    }
  }

  function handleDocumentKeyDown(event) {
    if (event.key !== "Escape") return;
    theaterSessionActive = false;
    theaterIntentUntil = 0;
    suppressTheaterUntil = Date.now() + SUPPRESS_THEATER_MS;
    window.setTimeout(scheduleUpdate, 0);
    window.setTimeout(scheduleUpdate, 120);
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

  function handleFullscreenChange() {
    clearFullscreenPendingTimer();
    if (isFullscreen()) {
      setFullscreenClass(true);
      return;
    }
    setFullscreenClass(false);
    suppressTheaterUntil = 0;
    scheduleUpdate();
    window.setTimeout(scheduleUpdate, 80);
  }

  const observer = new MutationObserver((mutations) => {
    if (isFullscreen()) return;
    if (mutations.length && mutations.every(isIgnoredMutation)) return;
    scheduleUpdate();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("keydown", handleDocumentKeyDown, true);
  document.addEventListener("tvtc:fs-request", markFullscreenPending);
  document.addEventListener("tvtc:fs-request-failed", () => {
    clearFullscreenPendingTimer();
    if (!isFullscreen()) setFullscreenClass(false);
  });
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleUpdate, { passive: true });
  window.addEventListener("popstate", scheduleUpdate);
  window.setInterval(() => {
    if (isFullscreen()) return;
    if (!document.documentElement.classList.contains(ROOT_CLASS)) scheduleUpdate();
  }, IDLE_REFRESH_INTERVAL_MS);

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function () {
    const result = originalPushState.apply(this, arguments);
    scheduleUpdate();
    return result;
  };
  history.replaceState = function () {
    const result = originalReplaceState.apply(this, arguments);
    scheduleUpdate();
    return result;
  };

  scheduleUpdate();
})();
