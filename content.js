(function () {
  const ROOT_CLASS = "tvtc-vertical-theater";
  const PLAYER_CLASS = "tvtc-player";
  const CHAT_CLASS = "tvtc-chat";
  const CHAT_ANCESTOR_CLASS = "tvtc-chat-anc";
  const FS_CLASS = "tvtc-fs";
  const CONTROLS_CLASS = "tvtc-controls";
  const ICON_BUTTON_CLASS = "tvtc-icon-button";
  const POSITION_BUTTON_CLASS = "tvtc-position-action";
  const VISIBILITY_BUTTON_CLASS = "tvtc-visibility-action";

  const LEGACY_POSITION_KEY = "tvtc-chat-position";
  const LEGACY_HIDDEN_KEY = "tvtc-chat-hidden-v2";

  const THEATER_INTENT_MS = 2500;
  const SUPPRESS_THEATER_MS = 1200;
  const ESCAPE_VERIFY_MS = 150;
  const FULLSCREEN_FAILSAFE_MS = 1500;
  const POST_ACTION_REFRESH_MS = [0, 16, 80, 300];
  const IDLE_REFRESH_INTERVAL_MS = 1000;
  const MIN_PLAYER_HEIGHT_PX = 240;
  const MIN_CHAT_HEIGHT_PX = 220;

  const DEFAULT_SETTINGS = {
    enabled: true,
    chatPosition: "bottom",
    chatHidden: false,
    breakpointPx: 820
  };

  // Paths that can never be a watch page. Everything else is still gated on
  // Theater Mode being active and a video player existing in the DOM.
  const NON_WATCH_PREFIXES = [
    "/directory", "/videos", "/settings", "/search", "/subscriptions",
    "/inventory", "/drops", "/wallet", "/friends", "/messages", "/popout",
    "/moderator", "/downloads", "/jobs", "/store", "/turbo", "/p/", "/u/"
  ];

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

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let scheduled = false;
  let theaterSessionActive = false;
  let theaterIntentUntil = 0;
  let suppressTheaterUntil = 0;
  let fullscreenPendingTimer = null;

  function clamp(min, value, max) {
    return Math.min(Math.max(value, min), max);
  }

  // ------------------------------------------------------------------
  // Settings (chrome.storage.sync, shared with the toolbar popup)
  // ------------------------------------------------------------------

  function applySettings(partial) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in partial)) continue;
      if (key === "breakpointPx") {
        const value = Number(partial[key]);
        settings[key] = Number.isFinite(value)
          ? clamp(480, value, 1600)
          : DEFAULT_SETTINGS.breakpointPx;
      } else {
        settings[key] = partial[key];
      }
    }
  }

  function saveSettings(partial) {
    applySettings(partial);
    try {
      chrome.storage.sync.set(partial);
    } catch (error) {
      // Extension context can be invalidated on update/reload; the local
      // copy still drives this page session.
    }
  }

  function loadSettings() {
    let stored;
    try {
      stored = chrome.storage.sync.get(null);
    } catch (error) {
      scheduleUpdate();
      return;
    }
    stored.then((raw) => {
      // One-time migration from the pre-1.2 localStorage keys.
      const migrated = {};
      const legacyPosition = localStorage.getItem(LEGACY_POSITION_KEY);
      const legacyHidden = localStorage.getItem(LEGACY_HIDDEN_KEY);
      if (!("chatPosition" in raw) && (legacyPosition === "top" || legacyPosition === "bottom")) {
        migrated.chatPosition = legacyPosition;
      }
      if (!("chatHidden" in raw) && legacyHidden !== null) {
        migrated.chatHidden = legacyHidden === "true";
      }
      applySettings(raw);
      if (Object.keys(migrated).length) {
        saveSettings(migrated);
        localStorage.removeItem(LEGACY_POSITION_KEY);
        localStorage.removeItem(LEGACY_HIDDEN_KEY);
      }
      scheduleUpdateBurst();
    }).catch(() => scheduleUpdate());
  }

  function watchSettings() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        const partial = {};
        for (const key of Object.keys(changes)) {
          if (key in DEFAULT_SETTINGS) partial[key] = changes[key].newValue;
        }
        if (!Object.keys(partial).length) return;
        // onChanged also fires for our own writes; the local copy is already
        // up to date then, and side effects (chat expand) must not re-run.
        const selfEcho = "chatHidden" in partial && settings.chatHidden === partial.chatHidden;
        applySettings(partial);
        if (!selfEcho && partial.chatHidden === false) clickNativeChatExpand();
        scheduleUpdateBurst();
      });
    } catch (error) {
      // No storage access — popup settings just won't live-sync.
    }
  }

  function getChatPosition() {
    return settings.chatPosition === "top" ? "top" : "bottom";
  }

  function setChatPosition(position) {
    saveSettings({ chatPosition: position });
    scheduleUpdate();
  }

  function isChatHidden() {
    return settings.chatHidden === true;
  }

  function setChatHidden(hidden) {
    saveSettings({ chatHidden: hidden });
    if (!hidden) clickNativeChatExpand();
    scheduleUpdate();
    window.setTimeout(scheduleUpdate, 150);
  }

  // ------------------------------------------------------------------
  // Page-state queries
  // ------------------------------------------------------------------

  function isWatchPage() {
    const path = window.location.pathname;
    if (path.length <= 1) return false;
    return !NON_WATCH_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  function isVerticalLayout() {
    return window.innerHeight >= window.innerWidth || window.innerWidth <= settings.breakpointPx;
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
    if (!settings.enabled) return false;
    if (isFullscreen()) return false;
    if (!isWatchPage() || !isVerticalLayout()) return false;
    if (Date.now() < suppressTheaterUntil) return false;
    if (!isTheaterMode() && !theaterSessionActive && Date.now() >= theaterIntentUntil) return false;
    return Boolean(getVideoPlayer());
  }

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

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

    markChatAncestors(chat, player);
  }

  // At desktop widths Twitch nests the theater chat in wrapper columns that
  // natively overlay the right edge of the full-window player. Once the chat
  // is repositioned, those wrappers are empty but still intercept the mouse
  // (they can sit in a sibling stacking context, so no z-index of ours can
  // beat them). Mark them so the CSS can disable their pointer events; stop
  // before any ancestor that also contains the player.
  function markChatAncestors(chat, player) {
    const marked = new Set();
    if (chat) {
      let node = chat.parentElement;
      while (node && node !== document.body && !(player && node.contains(player))) {
        node.classList.add(CHAT_ANCESTOR_CLASS);
        marked.add(node);
        node = node.parentElement;
      }
    }
    document.querySelectorAll("." + CHAT_ANCESTOR_CLASS).forEach((node) => {
      if (!marked.has(node)) node.classList.remove(CHAT_ANCESTOR_CLASS);
    });
  }

  function updateLayoutVars(effectiveHidden) {
    const availableHeight = Math.max(360, window.innerHeight);
    const availableWidth = Math.max(320, window.innerWidth);
    let playerHeight = availableHeight;
    let chatHeight = 0;

    if (!effectiveHidden) {
      const minChatHeight = clamp(260, availableHeight * 0.28, 460);
      const maxPlayerHeight = Math.max(MIN_PLAYER_HEIGHT_PX, availableHeight - minChatHeight);
      const naturalPlayerHeight = availableWidth * 9 / 16;
      playerHeight = Math.round(clamp(MIN_PLAYER_HEIGHT_PX, naturalPlayerHeight, maxPlayerHeight));
      chatHeight = Math.round(Math.max(MIN_CHAT_HEIGHT_PX, availableHeight - playerHeight));
    }

    const chatPosition = getChatPosition();
    const playerTop = effectiveHidden
      ? Math.round((availableHeight - playerHeight) / 2)
      : (chatPosition === "top" ? chatHeight : 0);

    const style = document.documentElement.style;
    style.setProperty("--tvtc-player-top", playerTop + "px");
    style.setProperty("--tvtc-player-height", playerHeight + "px");
    style.setProperty("--tvtc-chat-height", chatHeight + "px");
    document.documentElement.dataset.tvtcChatPosition = chatPosition;
    document.documentElement.dataset.tvtcChatHidden = effectiveHidden ? "true" : "false";
  }

  // ------------------------------------------------------------------
  // Floating controls
  // ------------------------------------------------------------------

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

  function ensureControls(active, effectiveHidden) {
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

    updateButton(positionButton, nextPosition === "top" ? "up" : "down", "Move chat to " + nextPosition, (event) => {
      event.preventDefault();
      event.stopPropagation();
      setChatPosition(nextPosition);
    });

    updateButton(visibilityButton, effectiveHidden ? "show" : "hide", effectiveHidden ? "Show chat" : "Hide chat", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setChatHidden(!effectiveHidden);
    });
  }

  // ------------------------------------------------------------------
  // Fullscreen handling
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Update loop
  // ------------------------------------------------------------------

  function update() {
    scheduled = false;
    if (isFullscreen()) return;

    markLayoutNodes();

    if (!isWatchPage() || !isVerticalLayout()) theaterSessionActive = false;
    if (Date.now() >= suppressTheaterUntil) theaterSessionActive = isTheaterMode();

    const active = isActiveLayout();
    document.documentElement.classList.toggle(ROOT_CLASS, active);

    if (active) {
      // Native chat state is a full-document button scan — compute it once
      // per pass and share it between layout vars and controls.
      const effectiveHidden = isChatHidden() || isNativeChatCollapsed();
      updateLayoutVars(effectiveHidden);
      ensureControls(true, effectiveHidden);
    } else {
      ensureControls(false, false);
    }
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

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

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

    // Escape inside chat input / search / any editable field never exits
    // Theater Mode — don't tear the layout down for it.
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return;

    // Same when a Twitch modal (settings menu, clip dialog) is open: Escape
    // closes the modal, not Theater Mode. If Twitch does exit theater anyway,
    // the MutationObserver sees the class change and tears down normally.
    if (document.body.classList.contains("ReactModal__Body--open")) return;

    theaterSessionActive = false;
    theaterIntentUntil = 0;
    suppressTheaterUntil = Date.now() + SUPPRESS_THEATER_MS;
    window.setTimeout(scheduleUpdate, 0);

    // Escape also closes Twitch overlays (emote picker, menus) without
    // leaving Theater Mode. Verify shortly after: if Theater Mode is still
    // on, cancel the suppression instead of flapping the layout for 1.2s.
    window.setTimeout(() => {
      if (isTheaterMode()) {
        suppressTheaterUntil = 0;
        theaterSessionActive = true;
      }
      scheduleUpdate();
    }, ESCAPE_VERIFY_MS);
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

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------

  const observer = new MutationObserver((mutations) => {
    if (document.hidden || isFullscreen()) return;
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
  // SPA navigations, signalled by the main-world history hook.
  document.addEventListener("tvtc:nav", scheduleUpdateBurst);
  window.addEventListener("popstate", scheduleUpdate);
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleUpdate, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleUpdate();
  });

  // Failsafe sweep for anything the observer misses. Skipped entirely while
  // the tab is hidden or the window is horizontal — the observer and the
  // resize/visibility listeners re-arm it when circumstances change.
  window.setInterval(() => {
    if (document.hidden || isFullscreen()) return;
    if (!settings.enabled || !isVerticalLayout()) return;
    if (!document.documentElement.classList.contains(ROOT_CLASS)) scheduleUpdate();
  }, IDLE_REFRESH_INTERVAL_MS);

  loadSettings();
  watchSettings();
  scheduleUpdate();
})();
