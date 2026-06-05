(function () {
  const ROOT_CLASS = "tvtc-vertical-theater";
  const DEBUG_CLASS = "tvtc-debug";
  const PLAYER_CLASS = "tvtc-player";
  const CHAT_CLASS = "tvtc-chat";
  const BACKDROP_CLASS = "tvtc-backdrop";
  const CONTROLS_CLASS = "tvtc-controls";
  const POSITION_BUTTON_CLASS = "tvtc-position-action";
  const VISIBILITY_BUTTON_CLASS = "tvtc-visibility-action";
  const POSITION_KEY = "tvtc-chat-position";
  const HIDDEN_KEY = "tvtc-chat-hidden";
  let scheduled = false;
  let theaterSessionActive = false;
  let theaterIntentUntil = 0;
  let lastOverlayProbe = 0;
  const disabledOverlayNodes = new Map();

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
    const chat = findChatNode();
    return isChatHidden() || isNativeChatCollapsed() || !chat || !hasChatContent();
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
    return Boolean(findNativeChatButton("expand") || /\bcollapsed\b/i.test(chatClass));
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

  function isActiveLayout() {
    return isWatchPage() && isVerticalLayout() && (isTheaterMode() || theaterSessionActive || Date.now() < theaterIntentUntil) && Boolean(getVideoPlayer());
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

  function ensureBackdrop(active) {
    let backdrop = document.querySelector("." + BACKDROP_CLASS);

    if (!active) {
      if (backdrop) backdrop.remove();
      return;
    }

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = BACKDROP_CLASS;
      document.body.appendChild(backdrop);
    }
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

  function update() {
    scheduled = false;
    markLayoutNodes();
    if (!isWatchPage() || !isVerticalLayout()) theaterSessionActive = false;
    if (isTheaterMode()) theaterSessionActive = true;
    const active = isActiveLayout();
    document.documentElement.classList.toggle(ROOT_CLASS, active);

    if (active) {
      updateLayoutVars();
      suppressForeignPlayerOverlays();
    } else {
      restoreForeignOverlays();
    }

    ensureBackdrop(active);
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

    const theaterButton = target.closest('[data-a-target="player-theatre-mode-button"]');
    if (theaterButton) {
      const label = theaterButton.getAttribute("aria-label") || "";
      theaterSessionActive = !/exit (theatre|theater) mode/i.test(label);
      if (theaterSessionActive) theaterIntentUntil = Date.now() + 2500;
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

  function handleDocumentPointerMove() {
    if (!document.documentElement.classList.contains(ROOT_CLASS)) return;
    const now = Date.now();
    if (now - lastOverlayProbe < 120) return;
    lastOverlayProbe = now;
    suppressForeignPlayerOverlays();
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

  function isTwitchOwnedElement(element) {
    const classText = typeof element.className === "string" ? element.className : "";
    const idText = element.id || "";
    const srcText = element.getAttribute("src") || "";
    const markerText = (classText + " " + idText + " " + srcText).toLowerCase();

    if (/pip|picture|extension|ffz|franker|darkreader|surfshark/.test(markerText)) return false;

    return Boolean(
      element.closest('[data-a-target="player-controls"]') ||
        element.closest('[data-a-target="player-overlay-click-handler"]') ||
        element.closest('[data-a-target="ax-overlay"]') ||
        element.closest("#channel-player") ||
        element.closest(".player-controls") ||
        element.closest(".video-player__overlay") ||
        element.closest("." + CHAT_CLASS) ||
        element.closest("." + CONTROLS_CLASS)
    );
  }

  function looksLikeForeignOverlay(element, player) {
    if (!element || element === document.documentElement || element === document.body) return false;
    if (isTwitchOwnedElement(element)) return false;

    const rect = element.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const style = getComputedStyle(element);

    if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") return false;
    if (rect.width < 8 || rect.height < 8) return false;

    const overlapsPlayer =
      rect.right > playerRect.left &&
      rect.left < playerRect.right &&
      rect.bottom > playerRect.top &&
      rect.top < playerRect.bottom;

    if (!overlapsPlayer) return false;

    const classText = typeof element.className === "string" ? element.className : "";
    const idText = element.id || "";
    const srcText = element.getAttribute("src") || "";
    const text = (classText + " " + idText + " " + srcText).toLowerCase();

    return (
      /pip|picture|extension|ffz|franker|darkreader|surfshark|overlay|button|tooltip/.test(text) ||
      style.position === "fixed" ||
      style.position === "absolute"
    );
  }

  function disableForeignOverlay(element) {
    if (disabledOverlayNodes.has(element)) return;
    disabledOverlayNodes.set(element, {
      value: element.style.getPropertyValue("pointer-events"),
      priority: element.style.getPropertyPriority("pointer-events")
    });
    element.dataset.tvtcDisabledOverlay = "true";
    element.style.setProperty("pointer-events", "none", "important");
  }

  function restoreForeignOverlays() {
    for (const [element, pointerEvents] of disabledOverlayNodes) {
      element.style.setProperty("pointer-events", pointerEvents.value, pointerEvents.priority);
      delete element.dataset.tvtcDisabledOverlay;
    }
    disabledOverlayNodes.clear();
  }

  function suppressForeignPlayerOverlays() {
    const player = document.querySelector("." + PLAYER_CLASS);
    if (!player || isEffectiveChatHidden()) return;

    const rect = player.getBoundingClientRect();
    const points = [
      [rect.right - 8, rect.top + 8],
      [rect.right - 8, rect.bottom - 8],
      [rect.right - 70, rect.bottom - 35],
      [rect.right - 20, rect.bottom - 35],
      [rect.right - 20, rect.top + 35]
    ];

    for (const point of points) {
      const x = Math.max(0, Math.min(window.innerWidth - 1, point[0]));
      const y = Math.max(0, Math.min(window.innerHeight - 1, point[1]));
      const stack = document.elementsFromPoint(x, y);
      for (const element of stack) {
        if (looksLikeForeignOverlay(element, player)) disableForeignOverlay(element);
        if (element === player || element.getAttribute("data-a-target") === "video-player") break;
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.length && mutations.every(isIgnoredMutation)) return;
    scheduleUpdate(false);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("pointermove", handleDocumentPointerMove, true);
  window.addEventListener("resize", () => scheduleUpdate(true), { passive: true });
  window.addEventListener("orientationchange", () => scheduleUpdate(true), { passive: true });
  window.addEventListener("popstate", () => scheduleUpdate(true));
  window.setInterval(() => {
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

  scheduleUpdate(true);
})();
