import {
  PRIORITY,
  ID_BASE,
  DOMAINS_PER_RULE,
  ESSENTIAL_DOMAINS,
  ESSENTIAL_URL_FILTERS,
  YOUTUBE_ESSENTIAL_FILTERS,
  MAX_AUTO_EXCEPTIONS_PER_HOST
} from "./constants.js";
import { parseList } from "./filterParser.js";
import { isValidDomain } from "./hosts.js";
import {
  BALANCED_TRACKER_DOMAINS,
  BALANCED_TRACKER_FILTERS,
  STRICT_DOMAINS,
  STRICT_FILTERS
} from "../data/builtin.js";

export const LIST_PRIORITIES = {
  block: PRIORITY.LIST_BLOCK,
  allow: PRIORITY.LIST_ALLOW,
  important: PRIORITY.IMPORTANT
};

export const CUSTOM_PRIORITIES = {
  block: PRIORITY.CUSTOM_BLOCK,
  allow: PRIORITY.CUSTOM_ALLOW,
  important: PRIORITY.CUSTOM_IMPORTANT
};

function tierOf(entry) {
  if (entry.thirdParty === true || entry.inc.length > 0 || entry.requestDomain) return "balanced";
  return "strict";
}

function baseCondition(entry) {
  const condition = {};
  if (entry.types) condition.resourceTypes = entry.types;
  else if (entry.excludedTypes) condition.excludedResourceTypes = [...entry.excludedTypes, "main_frame"];
  if (entry.thirdParty === true) condition.domainType = "thirdParty";
  else if (entry.thirdParty === false) condition.domainType = "firstParty";
  if (entry.inc.length) condition.initiatorDomains = entry.inc;
  if (entry.exc.length) condition.excludedInitiatorDomains = entry.exc;
  if (entry.deny.length) condition.excludedRequestDomains = entry.deny;
  return condition;
}

function optionsKey(entry) {
  return JSON.stringify([
    entry.types,
    entry.excludedTypes,
    entry.thirdParty,
    entry.matchCase,
    entry.inc,
    entry.exc,
    entry.deny
  ]);
}

export function compileNetwork(entries, priorities, forceTier) {
  const allowDomains = new Map();
  const allowPatterns = new Set();
  for (const entry of entries) {
    if (!entry.exception) continue;
    const key = optionsKey(entry);
    if (entry.requestDomain) {
      let set = allowDomains.get(key);
      if (!set) {
        set = new Set();
        allowDomains.set(key, set);
      }
      set.add(entry.requestDomain);
    } else if (entry.urlFilter) {
      allowPatterns.add(key + "|" + entry.urlFilter);
    }
  }

  const groups = new Map();
  const singles = new Map();

  for (const entry of entries) {
    const tier = forceTier || (entry.exception ? "any" : tierOf(entry));
    const priority = entry.exception
      ? priorities.allow
      : entry.important
        ? priorities.important
        : priorities.block;
    const action = entry.exception ? "allow" : "block";
    const key = optionsKey(entry);

    if (!entry.exception && !entry.important) {
      if (entry.requestDomain && allowDomains.get(key) && allowDomains.get(key).has(entry.requestDomain)) continue;
      if (entry.urlFilter && allowPatterns.has(key + "|" + entry.urlFilter)) continue;
    }

    if (entry.requestDomain) {
      const groupKey = JSON.stringify([action, priority, tier, key]);
      let group = groups.get(groupKey);
      if (!group) {
        group = { tier, priority, action, entry, domains: new Set() };
        groups.set(groupKey, group);
      }
      group.domains.add(entry.requestDomain);
    } else {
      const singleKey = JSON.stringify([action, priority, tier, key, entry.urlFilter]);
      if (!singles.has(singleKey)) singles.set(singleKey, { tier, priority, action, entry });
    }
  }

  const templates = [];
  for (const group of groups.values()) {
    const domains = Array.from(group.domains).sort();
    for (let i = 0; i < domains.length; i += DOMAINS_PER_RULE) {
      const condition = baseCondition(group.entry);
      condition.requestDomains = domains.slice(i, i + DOMAINS_PER_RULE);
      templates.push({ t: group.tier, p: group.priority, a: group.action, c: condition, d: 1 });
    }
  }
  for (const single of singles.values()) {
    const condition = baseCondition(single.entry);
    if (single.entry.urlFilter) {
      condition.urlFilter = single.entry.urlFilter;
      condition.isUrlFilterCaseSensitive = single.entry.matchCase;
    }
    templates.push({ t: single.tier, p: single.priority, a: single.action, c: condition, d: 0 });
  }
  return templates;
}

export function builtinTemplates() {
  const out = [];
  const tpOnly = { domainType: "thirdParty" };
  for (let i = 0; i < BALANCED_TRACKER_DOMAINS.length; i += DOMAINS_PER_RULE) {
    out.push({
      t: "balanced",
      p: PRIORITY.LIST_BLOCK,
      a: "block",
      c: { ...tpOnly, requestDomains: BALANCED_TRACKER_DOMAINS.slice(i, i + DOMAINS_PER_RULE) },
      d: 1
    });
  }
  for (const item of BALANCED_TRACKER_FILTERS) {
    out.push({
      t: "balanced",
      p: PRIORITY.LIST_BLOCK,
      a: "block",
      c: { urlFilter: item.urlFilter, isUrlFilterCaseSensitive: false, resourceTypes: item.types, domainType: "thirdParty" },
      d: 0
    });
  }
  out.push({
    t: "strict",
    p: PRIORITY.LIST_BLOCK,
    a: "block",
    c: { ...tpOnly, requestDomains: STRICT_DOMAINS },
    d: 1
  });
  for (const item of STRICT_FILTERS) {
    out.push({
      t: "strict",
      p: PRIORITY.LIST_BLOCK,
      a: "block",
      c: { urlFilter: item.urlFilter, isUrlFilterCaseSensitive: false, resourceTypes: item.types, domainType: "thirdParty" },
      d: 0
    });
  }
  return out;
}

function intersect(own, gate) {
  const out = new Set();
  for (const a of own) {
    for (const g of gate) {
      if (a === g || a.endsWith("." + g)) out.add(a);
      else if (g.endsWith("." + a)) out.add(g);
    }
  }
  return Array.from(out);
}

export function applyGate(template, gate) {
  if (template.t === "any") return template.c;
  if (!gate) return null;
  const condition = { ...template.c };
  if (gate.only) {
    const only = condition.initiatorDomains ? intersect(condition.initiatorDomains, gate.only) : gate.only.slice();
    if (!only.length) return null;
    condition.initiatorDomains = only;
  }
  if (gate.exclude && gate.exclude.length) {
    const merged = new Set([...(condition.excludedInitiatorDomains || []), ...gate.exclude]);
    condition.excludedInitiatorDomains = Array.from(merged).sort();
  }
  return condition;
}

export function computeGates(settings) {
  const compat = [];
  const balanced = [];
  const strict = [];
  for (const [host, mode] of Object.entries(settings.siteModes || {})) {
    if (mode === "compatibility") compat.push(host);
    else if (mode === "balanced") balanced.push(host);
    else if (mode === "strict") strict.push(host);
  }
  let balancedGate;
  let strictGate;
  if (settings.mode === "compatibility") {
    const only = [...balanced, ...strict];
    balancedGate = only.length ? { only } : null;
    strictGate = strict.length ? { only: strict.slice() } : null;
  } else if (settings.mode === "balanced") {
    balancedGate = { exclude: compat };
    strictGate = strict.length ? { only: strict.slice() } : null;
  } else {
    balancedGate = { exclude: compat };
    strictGate = { exclude: [...compat, ...balanced] };
  }
  return { balanced: balancedGate, strict: strictGate };
}

export function sanitizeRule(rule) {
  const c = rule.condition;
  if (!c || !rule.action) return null;
  for (const key of ["requestDomains", "initiatorDomains", "excludedInitiatorDomains", "excludedRequestDomains", "resourceTypes", "excludedResourceTypes"]) {
    if (key in c) {
      if (!Array.isArray(c[key]) || c[key].length === 0) delete c[key];
    }
  }
  if (typeof c.urlFilter === "string") {
    if (!c.urlFilter || /[^\x21-\x7e]/.test(c.urlFilter) || /^\|\|\*/.test(c.urlFilter)) return null;
  } else {
    delete c.isUrlFilterCaseSensitive;
  }
  for (const key of ["requestDomains", "initiatorDomains", "excludedInitiatorDomains", "excludedRequestDomains"]) {
    if (c[key]) {
      c[key] = c[key].filter((d) => typeof d === "string" && (isValidDomain(d) || d === "localhost"));
      if (!c[key].length) {
        if (key === "requestDomains" || key === "initiatorDomains") return null;
        delete c[key];
      }
    }
  }
  const hasConstraint = c.urlFilter || c.requestDomains || c.initiatorDomains;
  if (!hasConstraint && rule.action.type !== "allowAllRequests") return null;
  return rule;
}

export function urlToFilter(url) {
  try {
    const parsed = new URL(url);
    const filter = "||" + parsed.host + parsed.pathname;
    if (/[^\x21-\x7e]/.test(filter) || /[*^|]/.test(parsed.pathname)) return null;
    return filter;
  } catch (e) {
    return null;
  }
}

export function systemRules(settings, siteOffHosts) {
  const rules = [];
  rules.push({
    priority: PRIORITY.ESSENTIAL,
    action: { type: "allow" },
    condition: { requestDomains: ESSENTIAL_DOMAINS }
  });
  for (const urlFilter of ESSENTIAL_URL_FILTERS) {
    rules.push({
      priority: PRIORITY.ESSENTIAL,
      action: { type: "allow" },
      condition: { urlFilter, isUrlFilterCaseSensitive: false }
    });
  }
  for (const urlFilter of YOUTUBE_ESSENTIAL_FILTERS) {
    rules.push({
      priority: PRIORITY.ESSENTIAL,
      action: { type: "allow" },
      condition: { urlFilter, isUrlFilterCaseSensitive: false }
    });
  }
  for (let i = 0; i < siteOffHosts.length; i += DOMAINS_PER_RULE) {
    rules.push({
      priority: PRIORITY.SITE_OFF,
      action: { type: "allowAllRequests" },
      condition: { requestDomains: siteOffHosts.slice(i, i + DOMAINS_PER_RULE), resourceTypes: ["main_frame"] }
    });
  }
  for (const [host, items] of Object.entries(settings.autoExceptions || {})) {
    for (const item of items.slice(0, MAX_AUTO_EXCEPTIONS_PER_HOST)) {
      const condition = { urlFilter: item.f, isUrlFilterCaseSensitive: false, initiatorDomains: [host] };
      if (Array.isArray(item.t) && item.t.length) condition.resourceTypes = item.t;
      rules.push({ priority: PRIORITY.SITE_ALLOW, action: { type: "allow" }, condition });
    }
  }
  return rules;
}

export function customRules(settings) {
  const rules = [];
  const domains = Array.from(
    new Set(
      (settings.customDomains || [])
        .map((d) => String(d).trim().toLowerCase())
        .filter((d) => isValidDomain(d))
    )
  );
  for (let i = 0; i < domains.length; i += DOMAINS_PER_RULE) {
    rules.push({
      priority: PRIORITY.CUSTOM_BLOCK,
      action: { type: "block" },
      condition: {
        requestDomains: domains.slice(i, i + DOMAINS_PER_RULE),
        resourceTypes: ["script", "image", "xmlhttprequest", "sub_frame", "media", "ping", "other", "stylesheet", "font"]
      }
    });
  }
  const text = settings.customRules || "";
  if (text.trim()) {
    const parsed = parseList(text);
    const templates = compileNetwork(parsed.network, CUSTOM_PRIORITIES, "any");
    for (const template of templates) {
      rules.push({ priority: template.p, action: { type: template.a }, condition: { ...template.c } });
    }
    if (parsed.allowAll.length) {
      rules.push({
        priority: PRIORITY.SITE_OFF,
        action: { type: "allowAllRequests" },
        condition: { requestDomains: parsed.allowAll, resourceTypes: ["main_frame"] }
      });
    }
  }
  return rules;
}

function classRank(template) {
  if (template.a === "allow") return 0;
  const tier = template.t === "balanced" ? 1 : 3;
  return tier + (template.d ? 0 : 1);
}

export function assembleDynamicRules(settings, listTemplates, siteOffHosts, maxRules) {
  const rules = [];
  let nextId = ID_BASE.system;
  const push = (rule) => {
    const clean = sanitizeRule(rule);
    if (!clean) return false;
    clean.id = nextId;
    nextId += 1;
    rules.push(clean);
    return true;
  };

  systemRules(settings, siteOffHosts).forEach(push);
  nextId = ID_BASE.custom;
  customRules(settings).forEach(push);

  const gates = computeGates(settings);
  const candidates = [];
  const sources = [{ id: "builtin", templates: builtinTemplates() }, ...listTemplates];
  for (const source of sources) {
    for (const template of source.templates) {
      candidates.push({ source: source.id, template });
    }
  }
  candidates.sort((a, b) => classRank(a.template) - classRank(b.template));

  const counters = {
    builtin: ID_BASE.builtin,
    easylist: ID_BASE.easylist,
    easyprivacy: ID_BASE.easyprivacy
  };
  let budget = maxRules - rules.length;
  for (const candidate of candidates) {
    if (budget <= 0) break;
    const { template, source } = candidate;
    const gate = template.t === "balanced" ? gates.balanced : template.t === "strict" ? gates.strict : null;
    const condition = applyGate(template, gate);
    if (!condition) continue;
    const rule = {
      id: counters[source] || ID_BASE.builtin,
      priority: template.p,
      action: { type: template.a },
      condition
    };
    const clean = sanitizeRule(rule);
    if (!clean) continue;
    counters[source] = (counters[source] || ID_BASE.builtin) + 1;
    rules.push(clean);
    budget -= 1;
  }
  return rules;
}

export function siteOffHostsFor(settings, now) {
  const hosts = new Set(settings.allowlist || []);
  for (const [host, until] of Object.entries(settings.suspended || {})) {
    if (until > now) hosts.add(host);
  }
  return Array.from(hosts).filter((h) => isValidDomain(h) || h === "localhost").sort();
}
