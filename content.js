(function () {
  const ROOT_CLASS = "tvtc-vertical-theater";
  const DEBUG_CLASS = "tvtc-debug";
  const PLAYER_CLASS = "tvtc-player";
  const CHAT_CLASS = "tvtc-chat";
  const TOGGLE_CLASS = "tvtc-position-toggle";
  const POSITION_KEY = "tvtc-chat-position";
  let scheduled = false;

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

  function isWatchPage() {
    const path = window.location.pathname;
    return path.length > 1 && !path.startsWith("/directory") && !path.startsWith("/videos");
  }

  function isVerticalLayout() {
    return window.innerHeight >= window.innerWidth || window.innerWidth <= 820;
  }

  function hasVisibleChat() {
    return Boolean(
      document.querySelector(".channel-root__right-column") ||
        document.querySelector('[data-a-target="right-column-chat-bar"]') ||
        document.querySelector('[data-test-selector="chat-room-component-layout"]')
    );
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

  function markLayoutNodes() {
    const videoPlayer = document.querySelector('[data-a-target="video-player"]');
    const player = videoPlayer;

    const chatBar = document.querySelector('[data-a-target="right-column-chat-bar"]');
    const chatLayout = document.querySelector('[data-test-selector="chat-room-component-layout"]');
    const chat = document.querySelector(".channel-root__right-column") || (chatBar && chatBar.parentElement) || (chatLayout && chatLayout.parentElement);

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
    const minChatHeight = clamp(240, availableHeight * 0.24, 420);
    const maxPlayerHeight = Math.max(240, availableHeight - minChatHeight);
    const naturalPlayerHeight = availableWidth * 9 / 16;
    const playerHeight = Math.round(clamp(240, naturalPlayerHeight, maxPlayerHeight));
    const chatHeight = Math.round(Math.max(220, availableHeight - playerHeight));
    const chatPosition = getChatPosition();
    const playerTop = chatPosition === "top" ? chatHeight : 0;

    const style = document.documentElement.style;
    style.setProperty("--tvtc-player-top", playerTop + "px");
    style.setProperty("--tvtc-player-height", playerHeight + "px");
    style.setProperty("--tvtc-chat-height", chatHeight + "px");
    document.documentElement.dataset.tvtcChatPosition = chatPosition;
  }

  function ensurePositionToggle() {
    const chat = document.querySelector("." + CHAT_CLASS);
    if (!chat) return;

    let button = chat.querySelector("." + TOGGLE_CLASS);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = TOGGLE_CLASS;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setChatPosition(getChatPosition() === "top" ? "bottom" : "top");
      });
      chat.appendChild(button);
    }

    const nextPosition = getChatPosition() === "top" ? "bottom" : "top";
    button.textContent = nextPosition === "top" ? "Top" : "Bottom";
    button.title = "Move chat to " + nextPosition;
    button.setAttribute("aria-label", "Move chat to " + nextPosition);
  }

  function removePositionToggles() {
    document.querySelectorAll("." + TOGGLE_CLASS).forEach((button) => button.remove());
  }

  function update() {
    scheduled = false;
    markLayoutNodes();
    updateLayoutVars();
    const active = isWatchPage() && isVerticalLayout() && hasVisibleChat() && isTheaterMode();
    document.documentElement.classList.toggle(ROOT_CLASS, active);

    if (active) {
      ensurePositionToggle();
    } else {
      removePositionToggles();
    }

    if (document.documentElement.classList.contains(DEBUG_CLASS)) {
      document.documentElement.dataset.tvtcState = JSON.stringify({
        active,
        vertical: isVerticalLayout(),
        theater: isTheaterMode(),
        chat: hasVisibleChat(),
        width: window.innerWidth,
        height: window.innerHeight
      });
    }
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-label", "aria-pressed"]
  });

  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleUpdate, { passive: true });
  window.addEventListener("popstate", scheduleUpdate);

  const pushState = history.pushState;
  const replaceState = history.replaceState;

  history.pushState = function () {
    const result = pushState.apply(this, arguments);
    scheduleUpdate();
    return result;
  };

  history.replaceState = function () {
    const result = replaceState.apply(this, arguments);
    scheduleUpdate();
    return result;
  };

  scheduleUpdate();
})();
