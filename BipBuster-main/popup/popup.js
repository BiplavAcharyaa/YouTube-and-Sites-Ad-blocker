const blockingToggle = document.getElementById("blockingToggle");
const cosmeticToggle = document.getElementById("cosmeticToggle");
const globalMode = document.getElementById("globalMode");
const tabBlockedCountEl = document.getElementById("tabBlockedCount");
const customDomainCountEl = document.getElementById("customDomainCount");
const openOptionsBtn = document.getElementById("openOptions");
const siteHost = document.getElementById("siteHost");
const siteState = document.getElementById("siteState");
const siteControls = document.getElementById("siteControls");
const siteToggle = document.getElementById("siteToggle");
const siteMode = document.getElementById("siteMode");
const pauseDuration = document.getElementById("pauseDuration");
const pauseBtn = document.getElementById("pauseBtn");
const reloadBtn = document.getElementById("reloadBtn");
const issueCard = document.getElementById("issueCard");
const issueTitle = document.getElementById("issueTitle");
const issueList = document.getElementById("issueList");
const issueActions = document.getElementById("issueActions");

let tabId = null;
let state = null;

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ ...message, tabId }, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}

function formatUntil(until) {
  const date = new Date(until);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function describeState(s) {
  if (!s.supported) return "Not available";
  if (s.reason === "global-off") return "Blocking off";
  if (s.reason === "allowlist") return "Protection off";
  if (s.reason === "suspended") return "Paused until " + formatUntil(s.until);
  return "Protected · " + s.mode;
}

function button(label, handler) {
  const el = document.createElement("button");
  el.textContent = label;
  el.addEventListener("click", handler);
  return el;
}

function renderIssue(s) {
  issueList.innerHTML = "";
  issueActions.innerHTML = "";
  const issue = s.issue;
  if (!issue && s.auto) {
    issueCard.hidden = false;
    issueTitle.textContent =
      s.auto.type === "exceptions"
        ? "Adjusted automatically: " + s.auto.count + " blocked resource" + (s.auto.count === 1 ? "" : "s") + " allowed on this site."
        : "Adjusted automatically: this site now uses " + s.auto.mode + " mode.";
    return;
  }
  if (!issue) {
    issueCard.hidden = true;
    return;
  }
  issueCard.hidden = false;
  if (issue.kind === "wall") {
    issueTitle.textContent = issue.youtube
      ? "YouTube is showing an ad blocker notice."
      : "This page appears to show an ad blocker notice.";
  } else if (issue.kind === "layout") {
    issueTitle.textContent = "Page content looks hidden by filtering.";
  } else {
    issueTitle.textContent = "Filtering blocked resources this page may need.";
  }
  const items = (issue.items || []).filter((i) => i.category !== "ad");
  for (const item of items.slice(0, 4)) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "item-url";
    span.textContent = item.url.replace(/^https?:\/\//, "");
    span.title = item.url + " (" + item.source + ")";
    li.appendChild(span);
    li.appendChild(
      button("Allow", async () => {
        await send({ type: "APPLY_FIX", action: "allow", urls: [item.url] });
        window.close();
      })
    );
    issueList.appendChild(li);
  }
  if (items.length > 1) {
    issueActions.appendChild(
      button("Allow all", async () => {
        await send({ type: "APPLY_FIX", action: "allow", urls: items.map((i) => i.url) });
        window.close();
      })
    );
  }
  if (s.mode !== "compatibility") {
    issueActions.appendChild(
      button("Compatibility mode", async () => {
        await send({ type: "APPLY_FIX", action: "compat" });
        window.close();
      })
    );
  }
  issueActions.appendChild(
    button("Pause 30 min", async () => {
      await send({ type: "APPLY_FIX", action: "pause" });
      window.close();
    })
  );
  issueActions.appendChild(
    button("Dismiss", async () => {
      await send({ type: "DISMISS_ISSUE" });
      issueCard.hidden = true;
    })
  );
}

function render(s) {
  state = s;
  blockingToggle.checked = s.global.blockingEnabled;
  cosmeticToggle.checked = s.global.cosmeticEnabled;
  globalMode.value = s.global.mode;
  customDomainCountEl.textContent = s.customDomainCount;
  tabBlockedCountEl.textContent = typeof s.blocked === "number" ? s.blocked : "N/A";
  siteHost.textContent = s.supported ? s.host : "This page";
  siteState.textContent = describeState(s);
  siteControls.hidden = !s.supported;
  siteToggle.checked = s.active || s.reason === "global-off" ? s.active : false;
  siteToggle.disabled = s.reason === "global-off";
  siteMode.value = s.siteMode || "";
  siteMode.disabled = !s.active;
  pauseBtn.textContent = s.reason === "suspended" ? "Resume" : "Pause";
  pauseDuration.hidden = s.reason === "suspended";
  renderIssue(s);
}

async function refresh() {
  const response = await send({ type: "GET_STATE" });
  if (response) render(response);
}

blockingToggle.addEventListener("change", async () => {
  await send({ type: "SET_GLOBAL", patch: { blockingEnabled: blockingToggle.checked }, reload: true });
  refresh();
});

cosmeticToggle.addEventListener("change", async () => {
  await send({ type: "SET_GLOBAL", patch: { cosmeticEnabled: cosmeticToggle.checked }, reload: true });
  refresh();
});

globalMode.addEventListener("change", async () => {
  await send({ type: "SET_GLOBAL", patch: { mode: globalMode.value }, reload: true });
  refresh();
});

siteToggle.addEventListener("change", async () => {
  if (!state || !state.host) return;
  await send({ type: "SET_SITE_PROTECTION", host: state.host, enabled: siteToggle.checked });
  refresh();
});

siteMode.addEventListener("change", async () => {
  if (!state || !state.host) return;
  await send({ type: "SET_SITE_MODE", host: state.host, mode: siteMode.value || null, reload: true });
  refresh();
});

pauseBtn.addEventListener("click", async () => {
  if (!state || !state.host) return;
  if (state.reason === "suspended") {
    await send({ type: "RESUME_SITE", host: state.host });
  } else {
    await send({ type: "SUSPEND_SITE", host: state.host, minutes: Number(pauseDuration.value) });
  }
  refresh();
});

reloadBtn.addEventListener("click", async () => {
  await send({ type: "RELOAD_TAB" });
  window.close();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) return;
  tabId = tabs[0].id;
  refresh();
});
