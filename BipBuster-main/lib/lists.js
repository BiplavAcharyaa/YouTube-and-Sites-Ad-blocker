import { LISTS, LIST_IDS, LIST_UPDATE_INTERVAL_MS } from "./constants.js";
import { parseList, serializeCosmetic } from "./filterParser.js";
import { compileNetwork, LIST_PRIORITIES } from "./ruleBuilder.js";
import { buildShards, genericKey, invalidateCosmeticCache } from "./cosmetic.js";
import { getSettings } from "./store.js";

async function readMeta() {
  const stored = await chrome.storage.local.get({ listMeta: {} });
  return stored.listMeta || {};
}

async function writeMeta(meta) {
  await chrome.storage.local.set({ listMeta: meta });
}

function versionOf(text) {
  const match = /^!\s*(?:Version|Last modified):\s*(.+)$/im.exec(text.slice(0, 2000));
  return match ? match[1].trim() : "";
}

async function updateOne(id, force) {
  const source = LISTS[id];
  const meta = await readMeta();
  const previous = meta[id] || {};
  const headers = {};
  if (!force && previous.etag) headers["If-None-Match"] = previous.etag;
  if (!force && previous.lastModified) headers["If-Modified-Since"] = previous.lastModified;

  let response;
  try {
    response = await fetch(source.url, { headers, cache: "no-store", credentials: "omit", redirect: "follow" });
  } catch (e) {
    meta[id] = { ...previous, checked: Date.now(), error: "network" };
    await writeMeta(meta);
    return { id, ok: false, changed: false };
  }

  if (response.status === 304) {
    meta[id] = { ...previous, checked: Date.now(), error: "" };
    await writeMeta(meta);
    return { id, ok: true, changed: false };
  }

  if (!response.ok) {
    meta[id] = { ...previous, checked: Date.now(), error: "http " + response.status };
    await writeMeta(meta);
    return { id, ok: false, changed: false };
  }

  const text = await response.text();
  if (text.length < 2000 || !/^\s*[[!]/.test(text)) {
    meta[id] = { ...previous, checked: Date.now(), error: "invalid" };
    await writeMeta(meta);
    return { id, ok: false, changed: false };
  }

  const parsed = parseList(text);
  const templates = compileNetwork(parsed.network, LIST_PRIORITIES);
  const cosmetic = serializeCosmetic(parsed.cosmetic);
  const shards = buildShards(id, cosmetic.hosts);

  await chrome.storage.local.set({ ["net:" + id]: templates });
  await chrome.storage.local.set(shards);
  await chrome.storage.local.set({ [genericKey(id)]: cosmetic.generic });

  meta[id] = {
    updated: Date.now(),
    checked: Date.now(),
    etag: response.headers.get("etag") || "",
    lastModified: response.headers.get("last-modified") || "",
    version: versionOf(text),
    network: templates.length,
    cosmetic: parsed.stats.cosmetic,
    unsupported: parsed.stats.unsupported,
    error: ""
  };
  await writeMeta(meta);
  invalidateCosmeticCache();
  return { id, ok: true, changed: true };
}

export async function updateLists({ force = false, onlyDue = false } = {}) {
  const settings = await getSettings();
  const meta = await readMeta();
  const results = [];
  for (const id of LIST_IDS) {
    if (!settings.listsEnabled[id]) continue;
    const info = meta[id];
    if (onlyDue && info && info.checked && Date.now() - info.checked < LIST_UPDATE_INTERVAL_MS) continue;
    results.push(await updateOne(id, force));
  }
  return results;
}

export async function listsMissingData() {
  const settings = await getSettings();
  const keys = LIST_IDS.filter((id) => settings.listsEnabled[id]).map((id) => "net:" + id);
  if (!keys.length) return [];
  const stored = await chrome.storage.local.get(keys);
  return keys.filter((k) => !stored[k]).map((k) => k.slice(4));
}

export async function loadListTemplates(settings) {
  const out = [];
  for (const id of LIST_IDS) {
    if (!settings.listsEnabled[id]) continue;
    const key = "net:" + id;
    const stored = await chrome.storage.local.get(key);
    if (Array.isArray(stored[key])) out.push({ id, templates: stored[key] });
  }
  return out;
}

export async function listStatus() {
  const settings = await getSettings();
  const meta = await readMeta();
  return LIST_IDS.map((id) => ({
    id,
    title: LISTS[id].title,
    enabled: !!settings.listsEnabled[id],
    updated: (meta[id] && meta[id].updated) || 0,
    checked: (meta[id] && meta[id].checked) || 0,
    network: (meta[id] && meta[id].network) || 0,
    cosmetic: (meta[id] && meta[id].cosmetic) || 0,
    unsupported: (meta[id] && meta[id].unsupported) || 0,
    version: (meta[id] && meta[id].version) || "",
    error: (meta[id] && meta[id].error) || ""
  }));
}

export async function listsStamp(settings) {
  const meta = await readMeta();
  return LIST_IDS.filter((id) => settings.listsEnabled[id]).map((id) => id + ":" + ((meta[id] && meta[id].updated) || 0)).join(",");
}
