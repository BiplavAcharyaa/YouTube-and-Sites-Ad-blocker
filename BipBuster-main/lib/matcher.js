import { domainMatches, sameSite } from "./hosts.js";

const regexCache = new Map();

export function urlFilterToRegex(filter, caseSensitive) {
  const key = (caseSensitive ? "1" : "0") + filter;
  const cached = regexCache.get(key);
  if (cached) return cached;
  let source = filter;
  let prefix = "";
  let suffix = "";
  if (source.startsWith("||")) {
    prefix = "^[a-z][a-z0-9+.\\-]*:\\/\\/(?:[^\\/?#]*\\.)?";
    source = source.slice(2);
  } else if (source.startsWith("|")) {
    prefix = "^";
    source = source.slice(1);
  }
  if (source.endsWith("|")) {
    suffix = "$";
    source = source.slice(0, -1);
  }
  let body = "";
  for (const ch of source) {
    if (ch === "*") body += ".*";
    else if (ch === "^") body += "(?:[^a-zA-Z0-9_.%\\-]|$)";
    else body += ch.replace(/[.+?${}()|[\]\\/]/g, "\\$&");
  }
  let regex;
  try {
    regex = new RegExp(prefix + body + suffix, caseSensitive ? "" : "i");
  } catch (e) {
    regex = null;
  }
  if (regexCache.size > 5000) regexCache.clear();
  regexCache.set(key, regex);
  return regex;
}

export function ruleMatches(rule, request) {
  const c = rule.condition;
  if (rule.action.type === "allowAllRequests") return false;
  if (c.resourceTypes) {
    if (!c.resourceTypes.includes(request.type)) return false;
  } else if (c.excludedResourceTypes) {
    if (c.excludedResourceTypes.includes(request.type)) return false;
  } else if (request.type === "main_frame") {
    return false;
  }
  if (c.domainType === "thirdParty" && !request.thirdParty) return false;
  if (c.domainType === "firstParty" && request.thirdParty) return false;
  if (c.initiatorDomains && !(request.initiator && domainMatches(request.initiator, c.initiatorDomains))) return false;
  if (c.excludedInitiatorDomains && request.initiator && domainMatches(request.initiator, c.excludedInitiatorDomains)) return false;
  if (c.requestDomains && !domainMatches(request.host, c.requestDomains)) return false;
  if (c.excludedRequestDomains && domainMatches(request.host, c.excludedRequestDomains)) return false;
  if (c.urlFilter) {
    const regex = urlFilterToRegex(c.urlFilter, c.isUrlFilterCaseSensitive === true);
    if (!regex || !regex.test(request.url)) return false;
  }
  return true;
}

export function evaluate(rules, request) {
  let best = null;
  for (const entry of rules) {
    const rule = entry.rule;
    if (best) {
      if (rule.priority < best.rule.priority) continue;
      if (rule.priority === best.rule.priority && !(rule.action.type === "allow" && best.rule.action.type === "block")) continue;
    }
    if (ruleMatches(rule, request)) best = entry;
  }
  return best;
}

export function buildRequest(url, host, initiator, type) {
  return {
    url,
    host,
    initiator,
    type,
    thirdParty: !sameSite(host, initiator)
  };
}
