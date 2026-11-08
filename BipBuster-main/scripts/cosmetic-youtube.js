(function () {
  const bb = globalThis.__bipbuster;
  if (!bb) return;

  const AD_SELECTORS = [
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-sparkles-text-search-renderer",
    "ytd-promoted-video-renderer",
    "ytd-companion-slot-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-ad-slot-renderer",
    "ytd-search-pyv-renderer",
    "ytd-primetime-promo-renderer",
    "ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)",
    "ytd-rich-item-renderer:has(> #content > ytd-in-feed-ad-layout-renderer)",
    "ytd-rich-section-renderer:has(> #content > ytd-statement-banner-renderer)",
    "ytd-rich-section-renderer:has(ytd-ad-slot-renderer)",
    "#masthead-ad",
    "#player-ads",
    ".ytp-ad-overlay-container"
  ];

  const SKIP_SELECTOR = ".ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button";
  const ENFORCEMENT_TAG = "YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL";

  let styleEl = null;
  let playerObserver = null;
  let waitObserver = null;
  let popupObserver = null;
  let wallReported = false;
  let skipEnabled = false;
  let frame = 0;

  function injectStyle() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.createElement("style");
    styleEl.id = "bipbuster-youtube-style";
    styleEl.textContent = AD_SELECTORS.map((s) => s + "{display:none!important}").join("\n");
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function removeStyle() {
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    styleEl = null;
  }

  function clickSkip() {
    frame = 0;
    if (!skipEnabled) return;
    const button = document.querySelector(SKIP_SELECTOR);
    if (!button || !button.getClientRects().length) return;
    button.click();
  }

  function queueSkip() {
    if (frame || !skipEnabled) return;
    frame = requestAnimationFrame(clickSkip);
  }

  function whenElement(selector, callback) {
    const found = document.querySelector(selector);
    if (found) {
      callback(found);
      return;
    }
    if (waitObserver) waitObserver.disconnect();
    waitObserver = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (!el) return;
      waitObserver.disconnect();
      waitObserver = null;
      callback(el);
    });
    waitObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function attachPlayer() {
    if (playerObserver) {
      playerObserver.disconnect();
      playerObserver = null;
    }
    if (!skipEnabled) return;
    whenElement("#movie_player", (player) => {
      playerObserver = new MutationObserver(queueSkip);
      playerObserver.observe(player, { childList: true, subtree: true });
      queueSkip();
    });
  }

  function reportWall() {
    if (wallReported) return;
    wallReported = true;
    bb.report({ kind: "wall", youtube: true, signals: ["enforcement-dialog"], failed: [] });
  }

  function containsEnforcement(node) {
    if (node.nodeType !== 1) return false;
    if (node.tagName === ENFORCEMENT_TAG) return true;
    return !!(node.querySelector && node.querySelector("ytd-enforcement-message-view-model"));
  }

  function attachPopupWatcher() {
    if (popupObserver) return;
    const check = () => {
      if (document.querySelector("ytd-enforcement-message-view-model")) reportWall();
    };
    whenElement("ytd-popup-container", (container) => {
      popupObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (containsEnforcement(node)) {
              reportWall();
              return;
            }
          }
        }
      });
      popupObserver.observe(container, { childList: true, subtree: true });
      check();
    });
  }

  function stopAll() {
    removeStyle();
    for (const observer of [playerObserver, waitObserver, popupObserver]) {
      if (observer) observer.disconnect();
    }
    playerObserver = null;
    waitObserver = null;
    popupObserver = null;
    skipEnabled = false;
  }

  bb.onConfig((cfg) => {
    if (!cfg || !cfg.youtube) return;
    if (!cfg.active) {
      stopAll();
      return;
    }
    if (cfg.cosmetic) injectStyle();
    else removeStyle();
    skipEnabled = !!cfg.youtubeAutoSkip;
    attachPlayer();
    attachPopupWatcher();
  });

  document.addEventListener("yt-navigate-finish", () => {
    attachPlayer();
    attachPopupWatcher();
  });
})();
