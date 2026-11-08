export const STATIC_RULESET_ID = "ruleset_ads_trackers";

export const MODES = ["balanced", "strict", "compatibility"];

export const DEFAULT_SETTINGS = {
  blockingEnabled: true,
  cosmeticEnabled: true,
  customDomains: [],
  mode: "balanced",
  siteModes: {},
  allowlist: [],
  suspended: {},
  customRules: "",
  listsEnabled: { easylist: true, easyprivacy: true },
  listAutoUpdate: true,
  autoExceptions: {},
  compatAutoFix: true,
  youtubeAutoSkip: false
};

export const RULE_KEYS = [
  "blockingEnabled",
  "customDomains",
  "mode",
  "siteModes",
  "allowlist",
  "suspended",
  "customRules",
  "listsEnabled",
  "autoExceptions"
];

export const PRIORITY = {
  LIST_BLOCK: 1000,
  LIST_ALLOW: 2000,
  IMPORTANT: 3000,
  ESSENTIAL: 4000,
  CUSTOM_BLOCK: 4200,
  CUSTOM_ALLOW: 4500,
  CUSTOM_IMPORTANT: 4600,
  SITE_ALLOW: 5000,
  SITE_OFF: 10000
};

export const ID_BASE = {
  system: 1,
  custom: 10000,
  easylist: 100000,
  easyprivacy: 200000,
  builtin: 300000
};

export const LISTS = {
  easylist: {
    id: "easylist",
    title: "EasyList",
    url: "https://easylist.to/easylist/easylist.txt"
  },
  easyprivacy: {
    id: "easyprivacy",
    title: "EasyPrivacy",
    url: "https://easylist.to/easylist/easyprivacy.txt"
  }
};

export const LIST_IDS = Object.keys(LISTS);

export const COSMETIC_SHARDS = 32;
export const DOMAINS_PER_RULE = 500;
export const MAX_AUTO_EXCEPTIONS_PER_HOST = 24;
export const LIST_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FALLBACK_MAX_DYNAMIC_RULES = 30000;

export const NETWORK_TYPES = [
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "media",
  "websocket",
  "other"
];

export const ESSENTIAL_DOMAINS = [
  "accounts.google.com",
  "accounts.youtube.com",
  "login.microsoftonline.com",
  "login.live.com",
  "appleid.apple.com",
  "challenges.cloudflare.com",
  "hcaptcha.com",
  "recaptcha.net",
  "js.stripe.com",
  "js.braintreegateway.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com"
];

export const ESSENTIAL_URL_FILTERS = [
  "||google.com/recaptcha/",
  "||gstatic.com/recaptcha/"
];

export const YOUTUBE_ESSENTIAL_FILTERS = [
  "||youtube.com/api/stats/playback",
  "||youtube.com/api/stats/watchtime",
  "||youtube.com/api/stats/qoe",
  "||youtube.com/api/stats/delayplay",
  "||youtube.com/api/stats/atr",
  "||youtube.com/generate_204",
  "||youtube.com/youtubei/v1/",
  "||youtube.com/s/player/",
  "||youtube.com/s/desktop/"
];

export const CDN_DOMAINS = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "ajax.googleapis.com",
  "code.jquery.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "maxcdn.bootstrapcdn.com",
  "stackpath.bootstrapcdn.com"
];
