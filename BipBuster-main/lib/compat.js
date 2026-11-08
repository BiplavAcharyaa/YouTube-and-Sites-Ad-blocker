import { CDN_DOMAINS, ESSENTIAL_DOMAINS, MAX_AUTO_EXCEPTIONS_PER_HOST } from "./constants.js";
import { domainMatches, normalizeHost, parseHost, sameSite } from "./hosts.js";
import { buildRequest, evaluate } from "./matcher.js";
import { urlToFilter } from "./ruleBuilder.js";
import { effective, setSiteMode, suspendSite } from "./sites.js";
import { getSettings, patchSettings } from "./store.js";
import { applyAll } from "./engine.js";
import { scheduleExpiry } from "./alarms.js";

const SAFE_CATEGORIES = new Set(["essential", "cdn", "first-party"]);
const EXCEPTION_TYPES = new Set(["script", "stylesheet", "image", "sub_frame", "font", "xmlhttprequest", "other"]);
const AD_HINT = /(?:^|[.\/_-])(?:ads?|adserver|adservice|adsystem|advert(?:s|ising|isement)?|banner|sponsor(?:ed)?|pagead|doubleclick|syndication|adnxs|criteo|taboola|outbrain|track(?:ing|er)?|pixel|analytics|metrics|telemetry|beacon)(?:[.\/_?-]|$)/i;
const ESSENTIAL_PATH = /\/(?:recaptcha|captcha|oauth2?|auth|login|signin|sso|consent)(?:[\/.?_-]|$)/i;
const RELOAD_WINDOW_MS = 10 * 60 * 1000;
const RELOAD_DAY_MS = 24 * 60 * 60 * 1000;

export function categorize(url, host, pageHost) {
  if (domainMatches(host, ESSENTIAL_DOMAINS) || ESSENTIAL_PATH.test(url)) return "essential";
  if (domainMatches(host, CDN_DOMAINS)) return "cdn";
  if (sameSite(host, pageHost)) return AD_HINT.test(url) ? "ad-like" : "first-party";
  return AD_HINT.test(url) ? "ad" : "third-party";
}

export function sourceOfId(id) {
  if (id < 10000) return "site";
  if (id < 100000) return "custom";
  if (id < 200000) return "EasyList";
  if (id < 300000) return "EasyPrivacy";
  return "builtin";
}

async function loadRules() {
  const entries = [];
  try {
    const response = await fetch(chrome.runtime.getURL("rules/rules.json"));
    const rules = await response.json();
    for (const rule of rules) entries.push({ rule, source: "core" });
  } catch (e) {
    entries.length = 0;
  }
  const dynamic = await chrome.declarativeNetRequest.getDynamicRules();
  for (const rule of dynamic) entries.push({ rule, source: sourceOfId(rule.id) });
  return entries;
}

export async function analyzeFailed(pageHost, failed) {
  if (!pageHost || !Array.isArray(failed) || !failed.length) return [];
  const entries = await loadRules();
  const out = [];
  const seen = new Set();
  for (const item of failed.slice(0, 25)) {
    if (!item || typeof item.u !== "string" || seen.has(item.u)) continue;
    seen.add(item.u);
    const host = parseHost(item.u);
    if (!host) continue;
    const type = typeof item.t === "string" ? item.t : "other";
    const best = evaluate(entries, buildRequest(item.u, host, pageHost, type));
    if (!best || best.rule.action.type !== "block") continue;
    out.push({
      url: item.u.slice(0, 300),
      type,
      category: categorize(item.u, host, pageHost),
      source: best.source,
      ruleId: best.rule.id
    });
  }
  return out;
}

export async function addAutoExceptions(host, items) {
  const settings = await getSettings();
  const map = { ...settings.autoExceptions };
  const list = [...(map[host] || [])];
  let added = 0;
  for (const item of items) {
    const filter = urlToFilter(item.url);
    if (!filter) continue;
    const types = EXCEPTION_TYPES.has(item.type) ? [item.type] : undefined;
    if (list.some((x) => x.f === filter && JSON.stringify(x.t || null) === JSON.stringify(types || null))) continue;
    const entry = { f: filter, ts: Date.now(), u: item.url.slice(0, 200) };
    if (types) entry.t = types;
    list.push(entry);
    added += 1;
  }
  map[host] = list.slice(-MAX_AUTO_EXCEPTIONS_PER_HOST);
  await patchSettings({ autoExceptions: map });
  return added;
}

export async function removeAutoException(host, filter) {
  const settings = await getSettings();
  const map = { ...settings.autoExceptions };
  if (!map[host]) return;
  map[host] = map[host].filter((x) => x.f !== filter);
  if (!map[host].length) delete map[host];
  await patchSettings({ autoExceptions: map });
}

export async function clearAutoExceptions(host) {
  const settings = await getSettings();
  const map = { ...settings.autoExceptions };
  delete map[host];
  await patchSettings({ autoExceptions: map });
}

async function sessionGet(key) {
  const stored = await chrome.storage.session.get(key);
  return stored[key];
}

export async function getIssue(tabId) {
  return (await sessionGet("iss:" + tabId)) || null;
}

export async function clearIssue(tabId) {
  await chrome.storage.session.remove("iss:" + tabId);
  try {
    await chrome.action.setTitle({ tabId, title: "" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#5f6368" });
  } catch (e) {
    return;
  }
}

export async function getAuto(host) {
  if (!host) return null;
  const entry = await sessionGet("auto:" + host);
  if (!entry || Date.now() - entry.ts > RELOAD_WINDOW_MS) return null;
  return entry;
}

async function setAuto(host, entry) {
  await chrome.storage.session.set({ ["auto:" + host]: { ...entry, ts: Date.now() } });
}

async function reloadAllowed(host) {
  const guard = (await sessionGet("guard")) || {};
  const now = Date.now();
  const history = (guard[host] || []).filter((t) => now - t < RELOAD_DAY_MS);
  if (history.some((t) => now - t < RELOAD_WINDOW_MS)) return false;
  if (history.length >= 3) return false;
  history.push(now);
  guard[host] = history;
  await chrome.storage.session.set({ guard });
  return true;
}

async function flagTab(tabId, issue) {
  await chrome.storage.session.set({ ["iss:" + tabId]: issue });
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#f9a825" });
    await chrome.action.setTitle({ tabId, title: "BipBuster: compatibility issue detected" });
  } catch (e) {
    return;
  }
}

function lowerMode(mode) {
  if (mode === "strict") return "balanced";
  if (mode === "balanced") return "compatibility";
  return null;
}

export async function handleIssue(tabId, tabUrl, payload) {
  const settings = await getSettings();
  const rawHost = parseHost(tabUrl);
  const host = rawHost ? normalizeHost(rawHost) : null;
  if (!host) return;
  const eff = effective(settings, rawHost);
  if (!eff.active) return;
  const kind = payload.kind;
  let items = [];
  if (kind === "resource" || kind === "wall") {
    items = await analyzeFailed(rawHost, payload.failed || []);
  }
  if (kind === "resource" && !items.length) return;

  const issue = {
    kind,
    ts: Date.now(),
    host,
    items,
    signals: Array.isArray(payload.signals) ? payload.signals.slice(0, 6) : [],
    youtube: !!payload.youtube
  };
  await flagTab(tabId, issue);
  if (!settings.compatAutoFix) return;

  const safe = items.filter((i) => SAFE_CATEGORIES.has(i.category));
  if (safe.length) {
    if (!(await reloadAllowed(host))) return;
    const added = await addAutoExceptions(host, safe);
    if (!added) return;
    await setAuto(host, { type: "exceptions", count: added });
    await applyAll();
    await chrome.storage.session.remove("iss:" + tabId);
    await chrome.tabs.reload(tabId);
    return;
  }
  if (kind === "layout") {
    const next = lowerMode(eff.mode);
    if (!next || !(await reloadAllowed(host))) return;
    await setSiteMode(host, next);
    await setAuto(host, { type: "mode", mode: next });
    await applyAll();
    await chrome.storage.session.remove("iss:" + tabId);
    await chrome.tabs.reload(tabId);
  }
}

export async function applyFix(tabId, tabUrl, action, urls) {
  const rawHost = parseHost(tabUrl);
  const host = rawHost ? normalizeHost(rawHost) : null;
  if (!host) return false;
  if (action === "allow") {
    const issue = await getIssue(tabId);
    const wanted = ((issue && issue.items) || []).filter((i) => !Array.isArray(urls) || urls.includes(i.url));
    if (!wanted.length) return false;
    await addAutoExceptions(host, wanted);
  } else if (action === "compat") {
    await setSiteMode(host, "compatibility");
  } else if (action === "pause") {
    await suspendSite(host, 30);
    await scheduleExpiry();
  } else {
    return false;
  }
  await applyAll();
  await clearIssue(tabId);
  await chrome.storage.session.remove("iss:" + tabId);
  await chrome.tabs.reload(tabId);
  return true;
}
