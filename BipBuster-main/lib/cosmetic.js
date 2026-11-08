import { LIST_IDS, COSMETIC_SHARDS } from "./constants.js";
import { hashString, hostChain, isYouTubeHost, parseHost } from "./hosts.js";
import { parseFilterText } from "./filterParser.js";
import { BUILTIN_COSMETIC } from "../data/builtin.js";

const LIMITS = { balanced: 5000, strict: 20000 };
const shardCache = new Map();
const genericCache = new Map();
const cssCache = new Map();
let customCache = { text: null, data: null };

export function shardKey(listId, domain) {
  return "cos:" + listId + ":" + (hashString(domain) % COSMETIC_SHARDS);
}

export function genericKey(listId) {
  return "cosg:" + listId;
}

export function buildShards(listId, hosts) {
  const shards = {};
  for (let i = 0; i < COSMETIC_SHARDS; i += 1) shards["cos:" + listId + ":" + i] = {};
  for (const [domain, entry] of Object.entries(hosts)) {
    shards[shardKey(listId, domain)][domain] = entry;
  }
  return shards;
}

export function invalidateCosmeticCache() {
  shardCache.clear();
  genericCache.clear();
  cssCache.clear();
  customCache = { text: null, data: null };
}

function rule(selector) {
  return selector + "{display:none!important}";
}

function cssFor(selectors) {
  let out = "";
  for (const selector of selectors) out += rule(selector) + "\n";
  return out;
}

async function readKeys(keys) {
  const missing = keys.filter((k) => !shardCache.has(k));
  if (missing.length) {
    const stored = await chrome.storage.local.get(missing);
    for (const key of missing) shardCache.set(key, stored[key] || null);
  }
  const out = {};
  for (const key of keys) out[key] = shardCache.get(key);
  return out;
}

function builtinCss(mode) {
  const key = "builtin:" + mode;
  if (cssCache.has(key)) return cssCache.get(key);
  let selectors = [...BUILTIN_COSMETIC.high];
  if (mode !== "compatibility") selectors = selectors.concat(BUILTIN_COSMETIC.medium);
  if (mode === "strict") selectors = selectors.concat(BUILTIN_COSMETIC.strict);
  const css = cssFor(selectors);
  cssCache.set(key, css);
  return css;
}

function genericSelectors(data, mode, chain) {
  if (!data) return [];
  const out = [];
  const limit = LIMITS[mode] || 0;
  if (!limit) return out;
  for (const selector of data.simple || []) {
    if (out.length >= limit) break;
    out.push(selector);
  }
  if (mode === "strict") {
    for (const selector of data.complex || []) {
      if (out.length >= limit) break;
      out.push(selector);
    }
  }
  for (const [selector, excluded] of data.withEx || []) {
    if (out.length >= limit) break;
    if (!excluded.some((d) => chain.includes(d))) out.push(selector);
  }
  return out;
}

async function loadGeneric(listId) {
  if (genericCache.has(listId)) return genericCache.get(listId);
  const key = genericKey(listId);
  const stored = await chrome.storage.local.get(key);
  const data = stored[key] || null;
  genericCache.set(listId, data);
  return data;
}

function customData(text) {
  if (customCache.text === text) return customCache.data;
  const { cosmetic } = parseFilterText(text || "");
  customCache = { text, data: cosmetic };
  return cosmetic;
}

function collectHost(entry, chain, hide, unhide, flags) {
  if (!entry) return;
  if (entry.eh) flags.elemhide = true;
  if (entry.gh) flags.generichide = true;
  for (const item of entry.h || []) {
    if (typeof item === "string") hide.add(item);
    else if (!item[1].some((d) => chain.includes(d))) hide.add(item[0]);
  }
  for (const selector of entry.u || []) unhide.add(selector);
}

export async function cosmeticCssFor(frameUrl, frameId, settings, eff) {
  const host = parseHost(frameUrl);
  if (!host || !eff.active || !settings.cosmeticEnabled) return "";
  if (isYouTubeHost(host)) return "";
  const mode = eff.mode;
  const chain = hostChain(host);
  const hide = new Set();
  const unhide = new Set();
  const flags = { elemhide: false, generichide: false };
  const sources = LIST_IDS.filter((id) => settings.listsEnabled[id]);

  const keys = [];
  for (const id of sources) for (const h of chain) keys.push(shardKey(id, h));
  const shards = await readKeys(Array.from(new Set(keys)));
  for (const id of sources) {
    for (const h of chain) {
      const shard = shards[shardKey(id, h)];
      collectHost(shard && shard[h], chain, hide, unhide, flags);
    }
  }

  const custom = customData(settings.customRules);
  for (const h of chain) collectHost(custom.hosts[h], chain, hide, unhide, flags);

  if (flags.elemhide) return "";

  let generic = [];
  const allowGeneric = frameId === 0 && !flags.generichide;
  if (allowGeneric) {
    if (mode !== "compatibility") {
      for (const id of sources) {
        generic = generic.concat(genericSelectors(await loadGeneric(id), mode, chain));
      }
    }
    generic = generic.concat(genericSelectors({ simple: custom.generic.simple, complex: custom.generic.complex, withEx: custom.generic.withEx }, "strict", chain));
    for (const selector of custom.generic.unhide || []) unhide.add(selector);
    if (mode !== "compatibility") {
      for (const id of sources) {
        const data = await loadGeneric(id);
        for (const selector of (data && data.unhide) || []) unhide.add(selector);
      }
    }
  }

  const selectors = [];
  for (const selector of hide) if (!unhide.has(selector)) selectors.push(selector);
  for (const selector of generic) if (!unhide.has(selector) && !hide.has(selector)) selectors.push(selector);

  let css = frameId === 0 ? builtinCss(mode) : "";
  css += cssFor(selectors);
  return css;
}
