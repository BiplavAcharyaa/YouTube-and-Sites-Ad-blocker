export const BALANCED_TRACKER_DOMAINS = [
  "google-analytics.com",
  "scorecardresearch.com",
  "quantserve.com",
  "hotjar.com",
  "mixpanel.com",
  "segment.io",
  "amplitude.com",
  "branch.io",
  "adjust.com",
  "appsflyer.com",
  "fullstory.com",
  "mouseflow.com",
  "crazyegg.com",
  "luckyorange.com",
  "heapanalytics.com",
  "bat.bing.com",
  "clarity.ms",
  "analytics.tiktok.com",
  "analytics.twitter.com",
  "static.ads-twitter.com",
  "ads.linkedin.com",
  "px.ads.linkedin.com",
  "snap.licdn.com",
  "ct.pinterest.com",
  "hm.baidu.com",
  "pixel.facebook.com"
];

export const BALANCED_TRACKER_FILTERS = [
  { urlFilter: "||facebook.com/tr^", types: ["image", "script", "xmlhttprequest", "ping", "other"] },
  { urlFilter: "||connect.facebook.net/*/fbevents.js", types: ["script"] }
];

export const STRICT_DOMAINS = [
  "googletagmanager.com",
  "googleoptimize.com",
  "optimizely.com",
  "sc-static.net",
  "tapad.com",
  "bluekai.com",
  "demdex.net",
  "krxd.net",
  "everesttech.net",
  "agkn.com"
];

export const STRICT_FILTERS = [
  { urlFilter: "||connect.facebook.net/*/sdk/xfbml.customerchat.js", types: ["script"] }
];

export const CORE_AD_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "adservice.google.com",
  "googletagservices.com",
  "adnxs.com",
  "taboola.com",
  "outbrain.com",
  "adform.net",
  "criteo.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "moatads.com",
  "adsrvr.org",
  "bidswitch.net",
  "casalemedia.com",
  "advertising.com",
  "yieldmo.com",
  "media.net",
  "adroll.com",
  "adsafeprotected.com",
  "serving-sys.com",
  "3lift.com",
  "smartadserver.com",
  "sharethrough.com",
  "indexexchange.com",
  "amazon-adsystem.com",
  "2mdn.net",
  "teads.tv",
  "adcolony.com",
  "appnexus.com",
  "lijit.com",
  "sovrn.com",
  "revcontent.com",
  "mgid.com",
  "popads.net",
  "exoclick.com",
  "adcash.com",
  "zedo.com",
  "contextweb.com",
  "districtm.io",
  "gumgum.com",
  "sonobi.com",
  "spotxchange.com",
  "springserve.com",
  "smaato.net",
  "inmobi.com",
  "mopub.com"
];

export const CORE_AD_TYPES = [
  "script", "image", "xmlhttprequest", "sub_frame", "media", "ping", "other", "stylesheet", "font"
];

export const BUILTIN_COSMETIC = {
  high: [
    "ins.adsbygoogle",
    ".adsbygoogle",
    "[id^='div-gpt-ad']",
    "[id^='google_ads_iframe']",
    "[id^='google_ads_frame']",
    "iframe[id^='google_ads_iframe']",
    "iframe[src^='https://googleads.g.doubleclick.net']",
    "iframe[src*='.doubleclick.net/']",
    "iframe[src*='googlesyndication.com/']",
    "ins[data-ad-client]",
    "ins[data-ad-slot]",
    "div[data-ad-slot]",
    "div[data-ad-client]",
    "[id^='taboola-']",
    "[class~='trc_related_container']",
    ".OUTBRAIN",
    "[id^='outbrain_widget']",
    "[class~='ob-widget']"
  ],
  medium: [
    "[class~='ad-slot']",
    "[class~='ad-container']",
    "[class~='ad-banner']",
    "[class~='ad-wrapper']",
    "[class~='ad-unit']",
    "[class~='adunit']",
    "[class~='ad-box']",
    "[class~='advertisement']",
    "[id='advertisement']",
    "[class~='sponsored-content']",
    "[class~='sponsor-banner']"
  ],
  strict: [
    "[id*='google_ads']",
    "[class^='ad-container'], [class*=' ad-container']",
    "[class^='ad-banner'], [class*=' ad-banner']",
    "[class^='ad-slot'], [class*=' ad-slot']",
    "[class^='ad-wrapper'], [class*=' ad-wrapper']",
    "aside[class*='advert']",
    "div[class*='advert']",
    "[class*='sponsored-content']",
    "[class*='sponsor-banner']"
  ]
};

export const COLLAPSE_SELECTOR = [
  "[class~='ad']",
  "[class~='ads']",
  "[class~='advert']",
  "[class~='advertisement']",
  "[class~='ad-container']",
  "[class~='ad-wrapper']",
  "[class~='ad-slot']",
  "[class~='ad-unit']",
  "[class~='adunit']",
  "[class~='ad-box']",
  "[class~='ad-banner']",
  "[class~='ad-placeholder']",
  "[id^='ad-']",
  "[id^='ads-']",
  "[id^='ad_']",
  "[id^='div-gpt-ad']"
].join(",");
