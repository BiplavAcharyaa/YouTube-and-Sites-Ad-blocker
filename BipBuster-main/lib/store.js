import { DEFAULT_SETTINGS } from "./constants.js";

let cache = null;
let pending = null;

function merge(stored) {
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.listsEnabled = { ...DEFAULT_SETTINGS.listsEnabled, ...(stored.listsEnabled || {}) };
  for (const key of ["customDomains", "allowlist"]) {
    if (!Array.isArray(settings[key])) settings[key] = [];
  }
  for (const key of ["siteModes", "suspended", "autoExceptions"]) {
    if (!settings[key] || typeof settings[key] !== "object" || Array.isArray(settings[key])) settings[key] = {};
  }
  if (!["balanced", "strict", "compatibility"].includes(settings.mode)) settings.mode = "balanced";
  return settings;
}

export async function getSettings() {
  if (cache) return cache;
  if (!pending) {
    pending = chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS)).then((stored) => {
      cache = merge(stored);
      pending = null;
      return cache;
    });
  }
  return pending;
}

export async function patchSettings(patch) {
  await chrome.storage.local.set(patch);
  cache = null;
  return getSettings();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const key of Object.keys(changes)) {
    if (key in DEFAULT_SETTINGS) {
      cache = null;
      return;
    }
  }
});
