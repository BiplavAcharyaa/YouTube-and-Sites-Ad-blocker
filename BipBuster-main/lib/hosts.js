const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp",
  "co.in", "co.nz", "com.br", "com.cn", "com.np", "org.np", "edu.np", "gov.np",
  "net.np", "co.za", "com.mx", "com.tr", "com.sg", "com.hk", "co.kr", "com.ar",
  "com.pk", "com.bd", "com.ph", "com.my", "co.id", "com.ua", "com.eg", "com.sa",
  "co.il"
]);

const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isValidDomain(value) {
  return typeof value === "string" && DOMAIN_RE.test(value);
}

export function isIp(host) {
  return IPV4_RE.test(host) || host.includes(":");
}

export function parseHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch (e) {
    return null;
  }
}

export function normalizeHost(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
    try {
      value = new URL(value).hostname;
    } catch (e) {
      return null;
    }
  } else {
    value = value.split("/")[0].split("?")[0].split("#")[0];
    if (!value.startsWith("[")) value = value.split(":")[0];
  }
  value = value.replace(/^www\./, "").replace(/\.$/, "");
  if (isValidDomain(value) || value === "localhost" || IPV4_RE.test(value)) return value;
  return null;
}

export function hostChain(host) {
  if (!host) return [];
  if (isIp(host)) return [host];
  const parts = host.split(".");
  if (parts.length < 2) return [host];
  const chain = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    chain.push(parts.slice(i).join("."));
  }
  return chain;
}

export function lookup(map, host) {
  if (!map || !host) return undefined;
  for (const candidate of hostChain(host)) {
    if (Object.prototype.hasOwnProperty.call(map, candidate)) return map[candidate];
  }
  return undefined;
}

export function inList(list, host) {
  if (!Array.isArray(list) || !host) return false;
  const set = new Set(list);
  return hostChain(host).some((candidate) => set.has(candidate));
}

export function registrableDomain(host) {
  if (!host || isIp(host)) return host || "";
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

export function sameSite(a, b) {
  if (!a || !b) return false;
  return registrableDomain(a) === registrableDomain(b);
}

export function domainMatches(host, domains) {
  if (!host || !domains) return false;
  for (const domain of domains) {
    if (host === domain || host.endsWith("." + domain)) return true;
  }
  return false;
}

export function isYouTubeHost(host) {
  if (!host) return false;
  return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
}

export function hashString(value) {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
