import { getSettings } from "./store.js";
import { nextExpiry } from "./sites.js";

export const EXPIRE_ALARM = "bb-expire";
export const LISTS_ALARM = "bb-lists";

export async function scheduleExpiry() {
  const settings = await getSettings();
  const next = nextExpiry(settings.suspended);
  if (next) {
    chrome.alarms.create(EXPIRE_ALARM, { when: Math.max(next, Date.now()) + 31000 });
  } else {
    await chrome.alarms.clear(EXPIRE_ALARM);
  }
}

export async function ensureListsAlarm() {
  const existing = await chrome.alarms.get(LISTS_ALARM);
  if (!existing) {
    chrome.alarms.create(LISTS_ALARM, { delayInMinutes: 5, periodInMinutes: 360 });
  }
}
