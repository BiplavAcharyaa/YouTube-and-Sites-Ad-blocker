import { DEFAULT_SETTINGS, MODES } from "./lib/constants.js";
import { getSettings, patchSettings } from "./lib/store.js";
import { applyAll, configureBadge } from "./lib/engine.js";
import { effective, pruneSuspended, resumeSite, setAllowlisted, setSiteMode, suspendSite } from "./lib/sites.js";
import { cosmeticCssFor } from "./lib/cosmetic.js";
import { listStatus, listsMissingData, updateLists } from "./lib/lists.js";
import { EXPIRE_ALARM, LISTS_ALARM, ensureListsAlarm, scheduleExpiry } from "./lib/alarms.js";
import { applyFix, clearIssue, getAuto, getIssue, handleIssue, removeAutoException, clearAutoExceptions } from "./lib/compat.js";
import { isYouTubeHost, normalizeHost, parseHost } from "./lib/hosts.js";

const GLOBAL_KEYS = {
  blockingEnabled: "boolean",
  cosmeticEnabled: "boolean",
  youtubeAutoSkip: "boolean",
  compatAutoFix: "boolean",
  listAutoUpdate: "boolean"
};

let applyTimer = null;

function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    await applyAll();
    await refreshMissingLists();
    await scheduleExpiry();
  }, 200);
}

async function refreshMissingLists() {
  const missing = await listsMissingData();
  if (missing.length) {
    await updateLists({ force: true });
    await applyAll();
  }
}

async function bootstrap(forceRules) {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set(stored);
  await configureBadge();
  await pruneSuspended();
  await applyAll(forceRules);
  await scheduleExpiry();
  await ensureListsAlarm();
  await refreshMissingLists();
}

chrome.runtime.onInstalled.addListener(() => {
  bootstrap(true);
});

chrome.runtime.onStartup.addListener(() => {
  bootstrap(false);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const relevant = ["blockingEnabled", "customDomains", "mode", "siteModes", "allowlist", "suspended", "customRules", "listsEnabled", "autoExceptions"];
  if (relevant.some((key) => key in changes)) scheduleApply();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === EXPIRE_ALARM) {
    await pruneSuspended();
    await applyAll();
    await scheduleExpiry();
  } else if (alarm.name === LISTS_ALARM) {
    const settings = await getSettings();
    if (!settings.listAutoUpdate) return;
    const results = await updateLists({ onlyDue: true });
    if (results.some((r) => r.changed)) await applyAll();
  }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!/^https?:/i.test(details.url)) return;
  if (details.frameId === 0) await clearIssue(details.tabId);
  try {
    const settings = await getSettings();
    let topUrl = details.url;
    if (details.frameId !== 0) {
      const tab = await chrome.tabs.get(details.tabId);
      topUrl = tab.url || details.url;
    }
    const eff = effective(settings, parseHost(topUrl));
    const css = await cosmeticCssFor(details.url, details.frameId, settings, eff);
    if (!css) return;
    await chrome.scripting.insertCSS({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      css,
      origin: "USER"
    });
  } catch (e) {
    return;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove("iss:" + tabId);
});

async function readBlocked(tabId) {
  try {
    const text = await chrome.action.getBadgeText({ tabId });
    if (text === "") return 0;
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? value : null;
  } catch (e) {
    return null;
  }
}

async function getState(tabId) {
  const settings = await getSettings();
  let tab = null;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    tab = null;
  }
  const rawHost = tab && tab.url ? parseHost(tab.url) : null;
  const host = rawHost ? normalizeHost(rawHost) : null;
  const eff = effective(settings, rawHost);
  return {
    supported: !!rawHost,
    host,
    active: eff.active,
    reason: eff.reason || null,
    until: eff.until || null,
    mode: eff.mode,
    siteMode: eff.siteMode || null,
    global: {
      blockingEnabled: settings.blockingEnabled,
      cosmeticEnabled: settings.cosmeticEnabled,
      mode: settings.mode
    },
    blocked: await readBlocked(tabId),
    issue: await getIssue(tabId),
    auto: await getAuto(host),
    youtube: isYouTubeHost(rawHost),
    customDomainCount: settings.customDomains.length
  };
}

async function reloadTab(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.tabs.reload(tabId);
  } catch (e) {
    return;
  }
}

async function finishSiteChange(tabId) {
  await applyAll();
  await scheduleExpiry();
  await reloadTab(tabId);
}

async function privileged(message) {
  switch (message.type) {
    case "GET_STATE":
      return getState(message.tabId);
    case "GET_TAB_BLOCKED_COUNT":
      return { count: await readBlocked(message.tabId) };
    case "APPLY_SETTINGS":
      await applyAll();
      return { ok: true };
    case "SET_GLOBAL": {
      const patch = {};
      for (const [key, value] of Object.entries(message.patch || {})) {
        if (GLOBAL_KEYS[key] && typeof value === GLOBAL_KEYS[key]) patch[key] = value;
        if (key === "mode" && MODES.includes(value)) patch.mode = value;
      }
      await patchSettings(patch);
      await applyAll();
      if (message.reload) await reloadTab(message.tabId);
      return { ok: true };
    }
    case "SET_SITE_MODE": {
      const host = await setSiteMode(message.host, MODES.includes(message.mode) ? message.mode : null);
      await finishSiteChange(message.reload ? message.tabId : null);
      return { ok: !!host };
    }
    case "SET_SITE_PROTECTION": {
      const host = message.enabled ? await resumeSite(message.host) : await setAllowlisted(message.host, true);
      await finishSiteChange(message.tabId);
      return { ok: !!host };
    }
    case "SUSPEND_SITE": {
      const minutes = Number(message.minutes);
      const host = await suspendSite(message.host, Number.isFinite(minutes) ? minutes : 15);
      await finishSiteChange(message.tabId);
      return { ok: !!host };
    }
    case "RESUME_SITE": {
      const host = await resumeSite(message.host);
      await finishSiteChange(message.tabId);
      return { ok: !!host };
    }
    case "RELOAD_TAB":
      await reloadTab(message.tabId);
      return { ok: true };
    case "APPLY_FIX": {
      const tab = await chrome.tabs.get(message.tabId);
      const ok = await applyFix(message.tabId, tab.url || "", message.action, message.urls);
      return { ok };
    }
    case "DISMISS_ISSUE":
      await clearIssue(message.tabId);
      return { ok: true };
    case "LIST_STATUS":
      return { lists: await listStatus() };
    case "UPDATE_LISTS": {
      const results = await updateLists({ force: !!message.force });
      await applyAll();
      return { results, lists: await listStatus() };
    }
    case "REMOVE_AUTO_EXCEPTION":
      await removeAutoException(message.host, message.filter);
      await applyAll();
      return { ok: true };
    case "CLEAR_AUTO_EXCEPTIONS":
      await clearAutoExceptions(message.host);
      await applyAll();
      return { ok: true };
    default:
      return { ok: false };
  }
}

async function fromContent(message, sender) {
  if (!sender.tab || sender.frameId !== 0) return null;
  const tabUrl = sender.tab.url || "";
  if (message.type === "CS_INIT") {
    const settings = await getSettings();
    const rawHost = parseHost(tabUrl);
    const eff = effective(settings, rawHost);
    const youtube = isYouTubeHost(rawHost);
    return {
      active: eff.active,
      mode: eff.mode,
      cosmetic: eff.active && settings.cosmeticEnabled,
      collapse: eff.active && settings.cosmeticEnabled && eff.mode !== "compatibility" && !youtube,
      autoFix: settings.compatAutoFix,
      youtubeAutoSkip: eff.active && settings.youtubeAutoSkip,
      youtube
    };
  }
  if (message.type === "CS_ISSUE" && message.payload && typeof message.payload.kind === "string") {
    await handleIssue(sender.tab.id, tabUrl, message.payload);
    return { ok: true };
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  const internal = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
  const task = internal ? privileged(message) : fromContent(message, sender);
  task
    .then((result) => sendResponse(result))
    .catch(() => sendResponse(null));
  return true;
});
