(function () {
  const ROOT_CLASS = "tvtc-vertical-theater";
  const DEBUG_CLASS = "tvtc-debug";
  const PLAYER_CLASS = "tvtc-player";
  const CHAT_CLASS = "tvtc-chat";
  let scheduled = false;

  function clamp(min, value, max) {
    return Math.min(Math.max(value, min), max);
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

  function getTopOffset() {
    const nav = document.querySelector('[data-a-target="top-nav-container"], .top-nav');
    const rect = nav && nav.getBoundingClientRect();
    if (!rect || rect.height < 20 || rect.bottom < 20) return 0;
    return Math.round(rect.bottom);
  }

  function getLeftOffset(topOffset) {
    const candidates = Array.from(document.body.children)
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => {
        return (
          rect.left <= 1 &&
          rect.right > 35 &&
          rect.right < 120 &&
          rect.top <= topOffset + 4 &&
          rect.bottom > window.innerHeight * 0.5
        );
      });

    if (!candidates.length) return 0;
    return Math.round(Math.max(...candidates.map((rect) => rect.right)));
  }

  function updateLayoutVars() {
    const topOffset = getTopOffset();
    const leftOffset = getLeftOffset(topOffset);
    const availableHeight = Math.max(360, window.innerHeight - topOffset);
    const ratio = window.innerHeight > 1400 ? 0.34 : 0.32;
    const maxChatHeight = Math.min(760, availableHeight * 0.45);
    let chatHeight = clamp(300, availableHeight * ratio, maxChatHeight);

    if (availableHeight - chatHeight < 300) {
      chatHeight = Math.max(220, availableHeight - 300);
    }

    const style = document.documentElement.style;
    style.setProperty("--tvtc-top-offset", topOffset + "px");
    style.setProperty("--tvtc-left-offset", leftOffset + "px");
    style.setProperty("--tvtc-chat-height", Math.round(chatHeight) + "px");
  }

  function update() {
    scheduled = false;
    markLayoutNodes();
    updateLayoutVars();
    const active = isWatchPage() && isVerticalLayout() && hasVisibleChat() && isTheaterMode();
    document.documentElement.classList.toggle(ROOT_CLASS, active);

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
