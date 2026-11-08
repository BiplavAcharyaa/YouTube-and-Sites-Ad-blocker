import { hostChain, inList, lookup, normalizeHost } from "./hosts.js";
import { patchSettings, getSettings } from "./store.js";
import { MODES } from "./constants.js";

export function effective(settings, host, now = Date.now()) {
  if (!host) return { active: false, reason: "unsupported", mode: settings.mode };
  if (!settings.blockingEnabled) return { active: false, reason: "global-off", mode: settings.mode };
  if (inList(settings.allowlist, host)) return { active: false, reason: "allowlist", mode: settings.mode };
  const until = lookup(settings.suspended, host);
  if (typeof until === "number" && until > now) {
    return { active: false, reason: "suspended", until, mode: settings.mode };
  }
  const siteMode = lookup(settings.siteModes, host);
  return {
    active: true,
    mode: siteMode || settings.mode,
    source: siteMode ? "site" : "global",
    siteMode: siteMode || null
  };
}

function ownKey(map, host) {
  for (const candidate of hostChain(host)) {
    if (Object.prototype.hasOwnProperty.call(map, candidate)) return candidate;
  }
  return null;
}

export async function setSiteMode(rawHost, mode) {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const settings = await getSettings();
  const siteModes = { ...settings.siteModes };
  const existing = ownKey(siteModes, host);
  if (existing) delete siteModes[existing];
  if (mode && MODES.includes(mode)) siteModes[host] = mode;
  await patchSettings({ siteModes });
  return host;
}

export async function setAllowlisted(rawHost, allowed) {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const settings = await getSettings();
  const set = new Set(settings.allowlist);
  if (allowed) {
    set.add(host);
  } else {
    for (const candidate of hostChain(host)) set.delete(candidate);
  }
  const suspended = { ...settings.suspended };
  if (allowed) {
    const key = ownKey(suspended, host);
    if (key) delete suspended[key];
  }
  await patchSettings({ allowlist: Array.from(set).sort(), suspended });
  return host;
}

export async function suspendSite(rawHost, minutes) {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const settings = await getSettings();
  const suspended = { ...settings.suspended, [host]: Date.now() + Math.max(1, minutes) * 60000 };
  await patchSettings({ suspended });
  return host;
}

export async function resumeSite(rawHost) {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const settings = await getSettings();
  const suspended = { ...settings.suspended };
  const key = ownKey(suspended, host);
  if (key) delete suspended[key];
  const allow = new Set(settings.allowlist);
  for (const candidate of hostChain(host)) allow.delete(candidate);
  await patchSettings({ suspended, allowlist: Array.from(allow).sort() });
  return host;
}

export async function pruneSuspended(now = Date.now()) {
  const settings = await getSettings();
  const suspended = {};
  let changed = false;
  for (const [host, until] of Object.entries(settings.suspended)) {
    if (typeof until === "number" && until > now) suspended[host] = until;
    else changed = true;
  }
  if (changed) await patchSettings({ suspended });
  return suspended;
}

export function nextExpiry(suspended) {
  const values = Object.values(suspended).filter((v) => typeof v === "number");
  return values.length ? Math.min(...values) : null;
}
