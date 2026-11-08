import {
  STATIC_RULESET_ID,
  RULE_KEYS,
  FALLBACK_MAX_DYNAMIC_RULES
} from "./constants.js";
import { getSettings } from "./store.js";
import { assembleDynamicRules, siteOffHostsFor } from "./ruleBuilder.js";
import { loadListTemplates, listsStamp } from "./lists.js";

let chain = Promise.resolve();

async function setStaticRuleset(enabled) {
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [STATIC_RULESET_ID] });
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: [STATIC_RULESET_ID] });
    }
  } catch (e) {
    return;
  }
}

async function replaceDynamicRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  let addRules = rules;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
      return addRules.length;
    } catch (e) {
      const message = String((e && e.message) || e);
      const idMatch = /\bid\s+(\d+)/i.exec(message);
      if (idMatch) {
        const bad = Number(idMatch[1]);
        const next = addRules.filter((r) => r.id !== bad);
        if (next.length !== addRules.length) {
          addRules = next;
          continue;
        }
      }
      if (/limit|exceed|too many/i.test(message) && addRules.length > 100) {
        addRules = addRules.slice(0, Math.floor(addRules.length * 0.9));
        continue;
      }
      throw e;
    }
  }
  return 0;
}

async function signatureFor(settings) {
  const parts = {};
  for (const key of RULE_KEYS) parts[key] = settings[key];
  parts.stamp = await listsStamp(settings);
  parts.version = chrome.runtime.getManifest().version;
  return JSON.stringify(parts, (key, value) => (key === "suspended" ? Object.keys(value).sort().map((h) => [h, value[h] > Date.now()]) : value));
}

async function run(force) {
  const settings = await getSettings();
  const signature = await signatureFor(settings);
  const stored = await chrome.storage.local.get({ engineSignature: "" });
  if (!force && stored.engineSignature === signature) return;

  await setStaticRuleset(settings.blockingEnabled);
  let rules = [];
  if (settings.blockingEnabled) {
    const lists = await loadListTemplates(settings);
    const max = (chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || FALLBACK_MAX_DYNAMIC_RULES) - 200;
    rules = assembleDynamicRules(settings, lists, siteOffHostsFor(settings, Date.now()), max);
  }
  await replaceDynamicRules(rules);
  await chrome.storage.local.set({ engineSignature: signature });
}

export function applyAll(force = false) {
  chain = chain.then(() => run(force)).catch(() => undefined);
  return chain;
}

export async function configureBadge() {
  try {
    await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  } catch (e) {
    return;
  }
}
