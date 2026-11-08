import { DEFAULT_SETTINGS } from "../lib/constants.js";
import { normalizeHost, isValidDomain } from "../lib/hosts.js";
import { parseList } from "../lib/filterParser.js";

const el = (id) => document.getElementById(id);
const savedMessage = el("savedMessage");

function showMessage(text, color) {
  savedMessage.textContent = text;
  savedMessage.style.color = color || "#188038";
  setTimeout(() => {
    savedMessage.textContent = "";
    savedMessage.style.color = "#188038";
  }, 1800);
}

function showSaved() {
  showMessage("Saved");
}

function load() {
  return chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => ({
    ...DEFAULT_SETTINGS,
    ...stored,
    listsEnabled: { ...DEFAULT_SETTINGS.listsEnabled, ...(stored.listsEnabled || {}) }
  }));
}

function save(patch) {
  return chrome.storage.local.set(patch).then(showSaved);
}

function listItem(label, buttonLabel, handler) {
  const li = document.createElement("li");
  const span = document.createElement("span");
  span.textContent = label;
  const button = document.createElement("button");
  button.textContent = buttonLabel;
  button.addEventListener("click", handler);
  li.appendChild(span);
  li.appendChild(button);
  return li;
}

function renderDomains(domains) {
  const list = el("domainList");
  list.innerHTML = "";
  for (const domain of domains) {
    list.appendChild(listItem(domain, "Remove", () => removeDomain(domain)));
  }
}

function renderSites(settings) {
  const list = el("siteList");
  list.innerHTML = "";
  for (const host of settings.allowlist) {
    list.appendChild(
      listItem(host + " — protection off", "Remove", async () => {
        const current = await load();
        await save({ allowlist: current.allowlist.filter((h) => h !== host) });
        refresh();
      })
    );
  }
  for (const [host, mode] of Object.entries(settings.siteModes)) {
    list.appendChild(
      listItem(host + " — " + mode, "Remove", async () => {
        const current = await load();
        const next = { ...current.siteModes };
        delete next[host];
        await save({ siteModes: next });
        refresh();
      })
    );
  }
}

function renderExceptions(settings) {
  const list = el("exceptionList");
  list.innerHTML = "";
  for (const [host, items] of Object.entries(settings.autoExceptions)) {
    for (const item of items) {
      list.appendChild(
        listItem(host + " — " + (item.u || item.f).replace(/^https?:\/\//, ""), "Remove", () => {
          chrome.runtime.sendMessage({ type: "REMOVE_AUTO_EXCEPTION", host, filter: item.f }, () => refresh());
        })
      );
    }
  }
}

function formatTime(ms) {
  return ms ? new Date(ms).toLocaleString() : "never";
}

function renderLists(lists) {
  for (const info of lists) {
    const key = info.id.charAt(0).toUpperCase() + info.id.slice(1);
    const parts = [];
    parts.push(info.updated ? "Updated " + formatTime(info.updated) : "Not downloaded yet");
    if (info.network) parts.push(info.network + " network rules");
    if (info.cosmetic) parts.push(info.cosmetic + " cosmetic filters");
    if (info.unsupported) parts.push(info.unsupported + " unsupported skipped");
    if (info.error) parts.push("last error: " + info.error);
    el("status" + key).textContent = parts.join(" · ");
  }
}

function refreshLists() {
  chrome.runtime.sendMessage({ type: "LIST_STATUS" }, (response) => {
    if (response && response.lists) renderLists(response.lists);
  });
}

function summarizeRules(text) {
  const parsed = parseList(text);
  const cosmetic = parsed.stats.cosmetic;
  el("rulesSummary").textContent =
    parsed.stats.network + " network filters, " + cosmetic + " cosmetic filters, " + parsed.stats.unsupported + " unsupported (ignored)";
}

async function refresh() {
  const settings = await load();
  el("blockingToggle").checked = settings.blockingEnabled;
  el("cosmeticToggle").checked = settings.cosmeticEnabled;
  el("modeSelect").value = settings.mode;
  el("autoFixToggle").checked = settings.compatAutoFix;
  el("youtubeSkipToggle").checked = settings.youtubeAutoSkip;
  el("autoUpdateToggle").checked = settings.listAutoUpdate;
  el("listEasylist").checked = settings.listsEnabled.easylist;
  el("listEasyprivacy").checked = settings.listsEnabled.easyprivacy;
  el("customRules").value = settings.customRules;
  summarizeRules(settings.customRules);
  renderDomains(settings.customDomains);
  renderSites(settings);
  renderExceptions(settings);
  refreshLists();
}

async function addDomain() {
  const input = el("domainInput");
  const raw = input.value.trim().toLowerCase();
  if (!raw) return;
  if (!isValidDomain(raw)) {
    showMessage("Enter a valid domain, e.g. example.com", "#d93025");
    return;
  }
  const settings = await load();
  if (settings.customDomains.includes(raw)) {
    input.value = "";
    return;
  }
  const updated = [...settings.customDomains, raw];
  await save({ customDomains: updated });
  renderDomains(updated);
  input.value = "";
}

async function removeDomain(domain) {
  const settings = await load();
  const updated = settings.customDomains.filter((d) => d !== domain);
  await save({ customDomains: updated });
  renderDomains(updated);
}

async function addSite() {
  const host = normalizeHost(el("siteInput").value);
  if (!host) {
    showMessage("Enter a valid site, e.g. example.com", "#d93025");
    return;
  }
  const choice = el("siteModeSelect").value;
  const settings = await load();
  const allowlist = settings.allowlist.filter((h) => h !== host);
  const siteModes = { ...settings.siteModes };
  delete siteModes[host];
  if (choice === "off") allowlist.push(host);
  else siteModes[host] = choice;
  await save({ allowlist: allowlist.sort(), siteModes });
  el("siteInput").value = "";
  refresh();
}

el("blockingToggle").addEventListener("change", (e) => save({ blockingEnabled: e.target.checked }));
el("cosmeticToggle").addEventListener("change", (e) => save({ cosmeticEnabled: e.target.checked }));
el("modeSelect").addEventListener("change", (e) => save({ mode: e.target.value }));
el("autoFixToggle").addEventListener("change", (e) => save({ compatAutoFix: e.target.checked }));
el("youtubeSkipToggle").addEventListener("change", (e) => save({ youtubeAutoSkip: e.target.checked }));
el("autoUpdateToggle").addEventListener("change", (e) => save({ listAutoUpdate: e.target.checked }));

for (const id of ["easylist", "easyprivacy"]) {
  el("list" + id.charAt(0).toUpperCase() + id.slice(1)).addEventListener("change", async (e) => {
    const settings = await load();
    await save({ listsEnabled: { ...settings.listsEnabled, [id]: e.target.checked } });
    setTimeout(refreshLists, 1500);
  });
}

el("updateListsBtn").addEventListener("click", () => {
  el("updateListsBtn").disabled = true;
  chrome.runtime.sendMessage({ type: "UPDATE_LISTS", force: true }, (response) => {
    el("updateListsBtn").disabled = false;
    if (response && response.lists) renderLists(response.lists);
    const failed = response && response.results && response.results.some((r) => !r.ok);
    showMessage(failed ? "Some lists could not be updated" : "Lists updated", failed ? "#d93025" : "#188038");
  });
});

el("customRules").addEventListener("input", (e) => summarizeRules(e.target.value));
el("saveRulesBtn").addEventListener("click", () => save({ customRules: el("customRules").value }));
el("addSiteBtn").addEventListener("click", addSite);
el("siteInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});
el("addDomainBtn").addEventListener("click", addDomain);
el("domainInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDomain();
});

refresh();
