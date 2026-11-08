(function () {
  if (globalThis.__bipbuster) return;

  const COLLAPSE_SELECTOR = "[class~='ad'],[class~='ads'],[class~='advert'],[class~='advertisement'],[class~='ad-container'],[class~='ad-wrapper'],[class~='ad-slot'],[class~='ad-unit'],[class~='adunit'],[class~='ad-box'],[class~='ad-banner'],[class~='ad-placeholder'],[id^='ad-'],[id^='ads-'],[id^='ad_'],[id^='div-gpt-ad']";
  const AD_TOKEN = /(?:^|[\s_-])(?:ad|ads|adv|advert|advertisement|adslot|adunit|sponsor|sponsored)(?:$|[\s_-])/i;
  const AD_LABEL = /^(?:advertisement|advertising|sponsored|sponsor|ad|ads|advertise|publicit[eé]|werbung|anuncio|publicidad)$/i;
  const WALL_TEXT = /(?:ad[\s-]?block(?:er|ing)?|disable (?:your )?(?:ad|content)[\s-]?block|turn off (?:your )?(?:ad|content)[\s-]?block|whitelist (?:this|our) site|allow ads|pause (?:your )?ad[\s-]?block)/i;
  const WALL_HINT = /(?:modal|overlay|popup|pop-up|dialog|wall|adblock|blocker|notice|lightbox|backdrop|paywall|gate|interstitial)/i;
  const MEDIA_SELECTOR = "img,video,canvas,svg,picture,object,embed,audio,input,button,textarea,select,iframe";
  const SKIP_TAGS = new Set(["BODY", "HTML", "MAIN", "ARTICLE", "HEAD", "SCRIPT", "STYLE"]);
  const MULTI = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.in", "co.nz", "com.br", "com.cn", "com.np", "org.np", "edu.np", "gov.np", "net.np", "co.za", "com.mx", "com.tr", "com.sg", "com.hk", "co.kr", "com.ar", "com.pk", "com.bd", "com.ph", "com.my", "co.id", "com.ua", "com.eg", "com.sa", "co.il"]);
  const CDN_HOSTS = /(?:^|\.)(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|ajax\.googleapis\.com|code\.jquery\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|challenges\.cloudflare\.com|hcaptcha\.com|recaptcha\.net|js\.stripe\.com)$/i;

  const config = { value: null };
  const listeners = [];
  const failed = new Map();
  const state = {
    observer: null,
    pending: new Set(),
    timer: 0,
    processed: 0,
    reports: 0,
    reportTimer: 0,
    wallReported: false,
    layoutReported: false,
    collapsed: new Set()
  };

  function registrable(host) {
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join(".");
    return MULTI.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
  }

  const pageSite = registrable(location.hostname);

  function request() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "CS_INIT" }, (response) => {
          if (chrome.runtime.lastError || !response) resolve(null);
          else resolve(response);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function report(payload) {
    if (state.reports >= 4) return;
    state.reports += 1;
    try {
      chrome.runtime.sendMessage({ type: "CS_ISSUE", payload }, () => void chrome.runtime.lastError);
    } catch (e) {
      return;
    }
  }

  function failedEntries(onlyCandidates) {
    const out = [];
    for (const [url, type] of failed) {
      if (out.length >= 25) break;
      if (onlyCandidates) {
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch (e) {
          continue;
        }
        if (registrable(host) !== pageSite && !CDN_HOSTS.test(host)) continue;
      }
      out.push({ u: url, t: type });
    }
    return out;
  }

  function scheduleResourceReport() {
    if (state.reportTimer) return;
    state.reportTimer = setTimeout(() => {
      state.reportTimer = 0;
      if (!config.value || !config.value.active) return;
      const entries = failedEntries(true);
      if (entries.length) report({ kind: "resource", failed: entries });
    }, 1500);
  }

  function onResourceError(event) {
    const target = event.target;
    if (!target || !target.tagName || target === window) return;
    let url = "";
    let type = "";
    switch (target.tagName) {
      case "SCRIPT":
        url = target.src;
        type = "script";
        break;
      case "LINK":
        if (target.rel && target.rel.toLowerCase().includes("stylesheet")) {
          url = target.href;
          type = "stylesheet";
        }
        break;
      case "IMG":
        url = target.currentSrc || target.src;
        type = "image";
        break;
      default:
        return;
    }
    if (!url || !/^https?:/i.test(url) || failed.has(url) || failed.size >= 60) return;
    failed.set(url, type);
    scheduleResourceReport();
    if ((type === "image" || type === "script") && target.parentElement) queueNode(target.parentElement);
  }

  function visible(el) {
    if (!el.getClientRects().length) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function hasVisibleContent(el) {
    const text = (el.textContent || "").trim();
    if (text && !AD_LABEL.test(text)) return true;
    const media = el.querySelectorAll(MEDIA_SELECTOR);
    for (const node of media) {
      if (node.tagName === "IFRAME" && !visible(node)) continue;
      if (visible(node)) return true;
    }
    return false;
  }

  function looksLikeAd(el) {
    return AD_TOKEN.test(el.id || "") || AD_TOKEN.test(typeof el.className === "string" ? el.className : "");
  }

  function collapse(el) {
    if (state.collapsed.has(el)) return;
    el.setAttribute("data-bipbuster-collapsed", "1");
    el.style.setProperty("display", "none", "important");
    state.collapsed.add(el);
  }

  function collapseIfEmpty(el) {
    if (!el.isConnected || SKIP_TAGS.has(el.tagName)) return;
    if (el.hasAttribute("data-bipbuster-collapsed")) return;
    if (!looksLikeAd(el)) return;
    if (!el.getClientRects().length) return;
    if (hasVisibleContent(el)) return;
    collapse(el);
    let parent = el.parentElement;
    for (let depth = 0; parent && depth < 2; depth += 1) {
      if (SKIP_TAGS.has(parent.tagName) || !looksLikeAd(parent)) break;
      if (hasVisibleContent(parent)) break;
      collapse(parent);
      parent = parent.parentElement;
    }
  }

  function queueNode(node) {
    if (!node || node.nodeType !== 1 || !config.value || !config.value.active) return;
    if (state.pending.size >= 500) return;
    state.pending.add(node);
    if (!state.timer) state.timer = setTimeout(flush, 1200);
  }

  function flush() {
    state.timer = 0;
    const nodes = Array.from(state.pending);
    state.pending.clear();
    const walls = [];
    for (const node of nodes) {
      if (!node.isConnected) continue;
      if (config.value && config.value.collapse && state.processed < 400) {
        if (node.matches && node.matches(COLLAPSE_SELECTOR)) {
          state.processed += 1;
          collapseIfEmpty(node);
        }
        if (node.querySelectorAll) {
          for (const el of node.querySelectorAll(COLLAPSE_SELECTOR)) {
            if (state.processed >= 400) break;
            state.processed += 1;
            collapseIfEmpty(el);
          }
        }
      }
      walls.push(node);
    }
    checkWalls(walls);
  }

  function wallCandidate(node) {
    if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName)) return false;
    if (node.parentElement === document.body || node.parentElement === document.documentElement) return true;
    if (node.tagName === "DIALOG" || node.getAttribute("role") === "dialog" || node.getAttribute("role") === "alertdialog" || node.getAttribute("aria-modal") === "true") return true;
    return WALL_HINT.test(node.id || "") || WALL_HINT.test(typeof node.className === "string" ? node.className : "");
  }

  function isOverlay(node) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.position !== "fixed" && style.position !== "absolute" && style.position !== "sticky") return false;
    const rect = node.getBoundingClientRect();
    const coverage = (rect.width * rect.height) / Math.max(1, innerWidth * innerHeight);
    const z = parseInt(style.zIndex, 10);
    return coverage >= 0.25 && (Number.isFinite(z) ? z >= 100 : coverage >= 0.6);
  }

  function checkWalls(nodes) {
    if (state.wallReported || !config.value || !config.value.active) return;
    let checked = 0;
    for (const node of nodes) {
      if (checked >= 60) break;
      if (!wallCandidate(node)) continue;
      checked += 1;
      const text = (node.innerText || "").slice(0, 700);
      if (!text || !WALL_TEXT.test(text)) continue;
      if (!isOverlay(node)) continue;
      state.wallReported = true;
      const locked = [document.documentElement, document.body].some((el) => el && getComputedStyle(el).overflow === "hidden");
      report({ kind: "wall", signals: locked ? ["overlay", "scroll-locked"] : ["overlay"], failed: failedEntries(false) });
      return;
    }
  }

  function scanInitial() {
    if (!config.value || !config.value.active) return;
    const root = document.body;
    if (!root) return;
    queueNode(root);
    const candidates = [];
    for (const el of root.querySelectorAll("dialog,[role='dialog'],[role='alertdialog'],[aria-modal='true'],[id],[class]")) {
      if (candidates.length >= 400) break;
      if (wallCandidate(el)) candidates.push(el);
    }
    checkWalls(candidates);
  }

  function textLength(root, limit) {
    let total = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      total += walker.currentNode.nodeValue.trim().length;
      if (total >= limit) break;
    }
    return total;
  }

  function checkLayout() {
    if (state.layoutReported || !config.value || !config.value.cosmetic) return;
    const body = document.body;
    if (!body) return;
    if (textLength(body, 600) < 600) return;
    if ((body.innerText || "").trim().length > 30) return;
    for (const node of body.querySelectorAll("img,video,canvas,svg,iframe")) {
      if (visible(node)) return;
    }
    state.layoutReported = true;
    report({ kind: "layout", signals: ["hidden-content"] });
  }

  function start() {
    if (!state.observer && !config.value.youtube) {
      state.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) queueNode(node);
        }
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    const run = () => {
      scanInitial();
      setTimeout(checkLayout, 3000);
    };
    if (document.readyState === "complete") setTimeout(run, 800);
    else window.addEventListener("load", () => setTimeout(run, 800), { once: true });
  }

  function stop() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    state.pending.clear();
    clearTimeout(state.timer);
    state.timer = 0;
    for (const el of state.collapsed) {
      el.removeAttribute("data-bipbuster-collapsed");
      el.style.removeProperty("display");
    }
    state.collapsed.clear();
  }

  function apply(value) {
    config.value = value;
    if (!value || !value.active) stop();
    else start();
    for (const listener of listeners) listener(value);
  }

  function onConfig(callback) {
    listeners.push(callback);
    if (config.value) callback(config.value);
  }

  window.addEventListener("error", onResourceError, true);

  globalThis.__bipbuster = {
    ready: request().then((value) => {
      apply(value);
      return value;
    }),
    onConfig,
    report,
    failedEntries
  };

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const keys = ["blockingEnabled", "cosmeticEnabled", "mode", "siteModes", "allowlist", "suspended", "youtubeAutoSkip", "compatAutoFix"];
      if (!keys.some((key) => key in changes)) return;
      request().then((value) => apply(value));
    });
  } catch (e) {
    return;
  }
})();
