import { isValidDomain } from "./hosts.js";

const TYPE_MAP = {
  script: "script",
  image: "image",
  stylesheet: "stylesheet",
  css: "stylesheet",
  font: "font",
  media: "media",
  xmlhttprequest: "xmlhttprequest",
  xhr: "xmlhttprequest",
  subdocument: "sub_frame",
  frame: "sub_frame",
  ping: "ping",
  beacon: "ping",
  websocket: "websocket",
  object: "object",
  "object-subrequest": "object",
  other: "other"
};

const ALL_TYPES = [
  "sub_frame", "stylesheet", "script", "image", "font", "object",
  "xmlhttprequest", "ping", "media", "websocket", "other"
];

const PROCEDURAL = /:(?:-abp-|has-text|contains\(|matches-|min-text|nth-ancestor|upward|xpath|remove\(|style\(|watch-attr|others\(|if\(|if-not\()/i;
const SIMPLE_SELECTOR = /^(?:[a-z][a-z0-9-]*)?(?:(?:#|\.)[\w-]+|\[[\w-]+(?:[*^$~|]?=(?:"[^"]*"|'[^']*'|[\w-]+))?(?: i)?\])+$/i;
const OPTIONS_RE = /^[a-z0-9_~-]+(?:=[^,]*)?(?:,[a-z0-9_~-]+(?:=[^,]*)?)*$/i;
const COSMETIC_RE = /^([a-z0-9.,~*_-]*)(#@?[?$%]?#)(.+)$/i;

function findOptionsIndex(line) {
  const index = line.lastIndexOf("$");
  if (index < 0) return -1;
  return OPTIONS_RE.test(line.slice(index + 1)) ? index : -1;
}

function unique(list) {
  return Array.from(new Set(list)).sort();
}

function parseDomainList(value, separator) {
  const inc = [];
  const exc = [];
  let badPositive = false;
  for (const raw of value.split(separator)) {
    let d = raw.trim().toLowerCase();
    if (!d) continue;
    let negated = false;
    if (d[0] === "~") {
      negated = true;
      d = d.slice(1);
    }
    if (!isValidDomain(d)) {
      if (!negated) badPositive = true;
      continue;
    }
    (negated ? exc : inc).push(d);
  }
  return { inc: unique(inc), exc: unique(exc), badPositive };
}

function parseOptions(text) {
  const out = {
    types: [],
    notTypes: [],
    thirdParty: null,
    matchCase: false,
    important: false,
    inc: [],
    exc: [],
    deny: [],
    document: false,
    elemhide: false,
    generichide: false,
    unsupported: null
  };
  if (!text) return out;
  for (const part of text.split(",")) {
    let name = part;
    let value = "";
    const eq = part.indexOf("=");
    if (eq >= 0) {
      name = part.slice(0, eq);
      value = part.slice(eq + 1);
    }
    let negated = false;
    if (name[0] === "~") {
      negated = true;
      name = name.slice(1);
    }
    name = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(TYPE_MAP, name)) {
      (negated ? out.notTypes : out.types).push(TYPE_MAP[name]);
      continue;
    }
    switch (name) {
      case "third-party":
      case "3p":
        out.thirdParty = !negated;
        break;
      case "first-party":
      case "1p":
        out.thirdParty = negated;
        break;
      case "match-case":
        out.matchCase = !negated;
        break;
      case "important":
        out.important = !negated;
        break;
      case "all":
        out.types.push(...ALL_TYPES);
        break;
      case "domain": {
        const parsed = parseDomainList(value, "|");
        if (parsed.badPositive && parsed.inc.length === 0) out.unsupported = "domain";
        out.inc = parsed.inc;
        out.exc = parsed.exc;
        break;
      }
      case "denyallow": {
        const parsed = parseDomainList(value, "|");
        out.deny = parsed.inc;
        break;
      }
      case "document":
      case "doc":
        out.document = !negated;
        break;
      case "elemhide":
      case "ehide":
        out.elemhide = !negated;
        break;
      case "generichide":
      case "ghide":
        out.generichide = !negated;
        break;
      default:
        out.unsupported = name || "option";
    }
    if (out.unsupported) return out;
  }
  return out;
}

function validSelector(selector) {
  if (selector.length === 0 || selector.length > 500) return false;
  if (/[{};]/.test(selector)) return false;
  if (PROCEDURAL.test(selector)) return false;
  let parens = 0;
  let brackets = 0;
  let quote = null;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      parens += 1;
    } else if (ch === ")") {
      parens -= 1;
      if (parens < 0) return false;
    } else if (ch === "[") {
      brackets += 1;
    } else if (ch === "]") {
      brackets -= 1;
      if (brackets < 0) return false;
    }
  }
  return parens === 0 && brackets === 0 && quote === null;
}

function parseCosmetic(domainPart, separator, selectorRaw) {
  if (separator !== "##" && separator !== "#@#") return { kind: "unsupported", reason: "procedural" };
  const selector = selectorRaw.trim();
  if (selector.startsWith("+js(") || !validSelector(selector)) {
    return { kind: "unsupported", reason: "selector" };
  }
  const inc = [];
  const exc = [];
  let badPositive = false;
  if (domainPart) {
    for (const raw of domainPart.split(",")) {
      let d = raw.trim().toLowerCase();
      if (!d) continue;
      let negated = false;
      if (d[0] === "~") {
        negated = true;
        d = d.slice(1);
      }
      if (d.includes("*") || !isValidDomain(d)) {
        if (!negated) badPositive = true;
        continue;
      }
      (negated ? exc : inc).push(d);
    }
    if (badPositive && inc.length === 0) return { kind: "unsupported", reason: "domain" };
  }
  return {
    kind: "cosmetic",
    unhide: separator === "#@#",
    selector,
    inc: unique(inc),
    exc: unique(exc)
  };
}

function parseNetwork(line) {
  let body = line;
  let exception = false;
  if (body.startsWith("@@")) {
    exception = true;
    body = body.slice(2);
  }
  let pattern = body;
  let optionText = "";
  const optionsIndex = findOptionsIndex(body);
  if (optionsIndex >= 0) {
    pattern = body.slice(0, optionsIndex);
    optionText = body.slice(optionsIndex + 1);
  }
  const options = parseOptions(optionText);
  if (options.unsupported) return { kind: "unsupported", reason: options.unsupported };

  let p = pattern;
  if (p.length > 2 && p[0] === "/" && p[p.length - 1] === "/" && /[\\[\](){}+?|]/.test(p.slice(1, -1))) {
    return { kind: "unsupported", reason: "regex" };
  }
  if (!p.startsWith("|")) p = p.replace(/^\*+/, "");
  p = p.replace(/\*+$/, "");
  if (/[^\x21-\x7e]/.test(p)) return { kind: "unsupported", reason: "charset" };
  if (/^\|\|\*/.test(p)) return { kind: "unsupported", reason: "wildcard-host" };
  const core = p.replace(/^\|\|?/, "").replace(/\|$/, "");
  if (core.includes("|")) return { kind: "unsupported", reason: "pipe" };
  if (p === "|" || p === "||") return { kind: "unsupported", reason: "empty" };

  let requestDomain = null;
  const domainOnly = /^\|\|([a-z0-9.-]+)\^$/i.exec(p);
  if (domainOnly && isValidDomain(domainOnly[1].toLowerCase())) {
    requestDomain = domainOnly[1].toLowerCase();
  }

  if (options.document) {
    if (!exception || !requestDomain) return { kind: "unsupported", reason: "document" };
    return { kind: "allowall", host: requestDomain };
  }
  if (options.elemhide || options.generichide) {
    if (!exception || !requestDomain) return { kind: "unsupported", reason: "elemhide" };
    return { kind: "hostflag", host: requestDomain, flag: options.elemhide ? "eh" : "gh" };
  }

  let types = null;
  let excludedTypes = null;
  if (options.types.length) {
    types = unique(options.types);
  } else if (options.notTypes.length) {
    excludedTypes = unique(options.notTypes);
  }

  if (!requestDomain && !p && options.inc.length === 0) {
    return { kind: "unsupported", reason: "too-broad" };
  }

  return {
    kind: "network",
    exception,
    important: options.important && !exception,
    urlFilter: requestDomain ? null : p || null,
    requestDomain,
    types,
    excludedTypes,
    thirdParty: options.thirdParty,
    matchCase: options.matchCase,
    inc: options.inc,
    exc: options.exc,
    deny: options.deny
  };
}

export function parseLine(raw) {
  const line = raw.trim();
  if (!line || line[0] === "!" || line[0] === "[") return null;
  const cosmetic = COSMETIC_RE.exec(line);
  if (cosmetic) return parseCosmetic(cosmetic[1], cosmetic[2], cosmetic[3]);
  return parseNetwork(line);
}

function emptyCosmetic() {
  return {
    simple: new Set(),
    complex: new Set(),
    withEx: new Map(),
    genericUnhide: new Set(),
    hosts: new Map()
  };
}

function hostEntry(map, domain) {
  let entry = map.get(domain);
  if (!entry) {
    entry = { h: new Set(), hx: new Map(), u: new Set(), gh: 0, eh: 0 };
    map.set(domain, entry);
  }
  return entry;
}

function badfilterKey(line) {
  return line
    .trim()
    .replace(/,badfilter(?=,|$)/, "")
    .replace(/(^|\$)badfilter,/, "$1")
    .replace(/\$badfilter$/, "");
}

export function parseList(text) {
  const lines = text.split(/\r?\n/);
  const disabled = new Set();
  for (const line of lines) {
    if (line.includes("badfilter")) disabled.add(badfilterKey(line));
  }
  const network = [];
  const allowAll = new Set();
  const cosmetic = emptyCosmetic();
  const stats = { network: 0, cosmetic: 0, unsupported: 0 };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || disabled.has(line)) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    switch (parsed.kind) {
      case "network":
        network.push(parsed);
        stats.network += 1;
        break;
      case "allowall":
        allowAll.add(parsed.host);
        stats.network += 1;
        break;
      case "hostflag": {
        const entry = hostEntry(cosmetic.hosts, parsed.host);
        entry[parsed.flag] = 1;
        stats.cosmetic += 1;
        break;
      }
      case "cosmetic":
        addCosmetic(cosmetic, parsed);
        stats.cosmetic += 1;
        break;
      default:
        stats.unsupported += 1;
    }
  }
  return { network, allowAll: Array.from(allowAll), cosmetic, stats };
}

function addCosmetic(cosmetic, parsed) {
  const { selector, inc, exc, unhide } = parsed;
  if (inc.length === 0) {
    if (unhide) {
      cosmetic.genericUnhide.add(selector);
      return;
    }
    if (exc.length) {
      const existing = cosmetic.withEx.get(selector) || new Set();
      exc.forEach((d) => existing.add(d));
      cosmetic.withEx.set(selector, existing);
      return;
    }
    if (SIMPLE_SELECTOR.test(selector)) cosmetic.simple.add(selector);
    else cosmetic.complex.add(selector);
    return;
  }
  for (const domain of inc) {
    const entry = hostEntry(cosmetic.hosts, domain);
    if (unhide) {
      entry.u.add(selector);
    } else if (exc.length) {
      const existing = entry.hx.get(selector) || new Set();
      exc.forEach((d) => existing.add(d));
      entry.hx.set(selector, existing);
    } else {
      entry.h.add(selector);
    }
  }
}

export function serializeCosmetic(cosmetic) {
  const generic = {
    simple: Array.from(cosmetic.simple),
    complex: Array.from(cosmetic.complex),
    withEx: Array.from(cosmetic.withEx, ([selector, set]) => [selector, Array.from(set)]),
    unhide: Array.from(cosmetic.genericUnhide)
  };
  const hosts = {};
  for (const [domain, entry] of cosmetic.hosts) {
    const h = Array.from(entry.h);
    for (const [selector, set] of entry.hx) h.push([selector, Array.from(set)]);
    const out = {};
    if (h.length) out.h = h;
    if (entry.u.size) out.u = Array.from(entry.u);
    if (entry.gh) out.gh = 1;
    if (entry.eh) out.eh = 1;
    hosts[domain] = out;
  }
  return { generic, hosts };
}

export function parseFilterText(text) {
  const parsed = parseList(text);
  return { parsed, cosmetic: serializeCosmetic(parsed.cosmetic) };
}
