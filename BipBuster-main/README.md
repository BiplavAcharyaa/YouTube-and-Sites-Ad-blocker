# ⚡ BipBuster

### 🛡️ A lightweight, privacy-first ad & tracker blocker for Chromium

**BipBuster** is a learning-focused browser extension built to explore how modern ad blockers work under the hood.

It combines **network-level request blocking**, **cosmetic filtering**, **custom blocking rules**, and **browser-extension APIs** into one small, transparent project.

No magic. No black box. Just browser APIs, filtering rules, and a little bit of controlled chaos. 🚫📢

---

## 🚀 What is BipBuster?

Every time you open a website, your browser can make dozens — sometimes hundreds — of network requests.

Some load the actual page.

Others load:

* 📢 Advertisements
* 👁️ Tracking scripts
* 🧩 Third-party resources
* 📊 Analytics
* 🎯 Advertising networks
* 🪟 Annoying promotional elements
* 🔗 Unwanted external requests

BipBuster sits between the webpage and those requests and asks one simple question:

> **"Do we really need this?"**

If a request matches a blocking rule, BipBuster can stop it before the resource is loaded.

For elements that still make it onto the page, BipBuster can use **cosmetic filtering** to hide them from the interface.

---

## 🧠 How It Works

BipBuster uses two primary layers of filtering.

### 01 — Network Filtering

Powered by Chrome's **Manifest V3 `declarativeNetRequest` API**.

```text
Website
   │
   ├── Request → page content       ✅ ALLOW
   ├── Request → image              ✅ ALLOW
   ├── Request → ad network        ❌ BLOCK
   ├── Request → tracker            ❌ BLOCK
   └── Request → analytics         ❌ BLOCK
```

Requests are evaluated against BipBuster's filtering rules before they are allowed to proceed.

---

### 02 — Cosmetic Filtering

Not everything can be stopped at the network layer.

Some unwanted elements may already exist inside the webpage:

```html
<div class="advertisement">
    ...
</div>
```

BipBuster can use content scripts and CSS-based filtering to hide unwanted page elements.

```text
Network Filter
      ↓
Stop unwanted requests
      ↓
Page renders
      ↓
Cosmetic Filter
      ↓
Hide unwanted elements
```

Two layers.

One goal:

**Less garbage on your screen.**

---

## 🎯 Features

* ⚡ Manifest V3 architecture
* 🛡️ Network-level request blocking
* 🧹 Cosmetic filtering
* 🌐 Website filtering
* ▶️ YouTube-focused filtering support
* 📋 Custom blocked domains
* 🎛️ Global enable/disable switch
* 📊 Blocking statistics
* ⚙️ Dedicated options page
* 💾 Persistent settings using Chrome Storage
* 🔒 No backend
* 🔒 No browsing-history collection
* 🔒 No personal-data collection
* 🧩 Modular JavaScript architecture
* 🚫 No unnecessary frameworks or dependencies

---

## 🧪 YouTube

YouTube is intentionally included as part of the learning scope.

However, YouTube is not a static website.

Its advertising and playback architecture changes frequently, which means techniques that work today may stop working tomorrow.

BipBuster therefore uses legitimate browser-extension mechanisms rather than attempting to bypass DRM, authentication, or other browser security mechanisms.

The objective isn't to play an endless game of:

```text
YouTube changes something
        ↓
BipBuster breaks
        ↓
BipBuster gets fixed
        ↓
YouTube changes again
        ↓
repeat()
```

The objective is to understand **why** this happens and how browser extensions interact with modern websites.

---

## 🏗️ Architecture

At a high level:

```text
                 ┌─────────────────────┐
                 │      Web Page       │
                 └──────────┬──────────┘
                            │
                     Network Requests
                            │
                            ▼
                 ┌─────────────────────┐
                 │ declarativeNetRequest│
                 │    Rule Engine      │
                 └──────────┬──────────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
                BLOCK               ALLOW
                  │                   │
                  ▼                   ▼
               🚫 Stop            Page Loads
                                      │
                                      ▼
                             ┌─────────────────┐
                             │  Content Script │
                             │    Filtering    │
                             └────────┬────────┘
                                      │
                                      ▼
                               🧹 Cosmetic
                                Filtering
```

The extension UI communicates with the background/service-worker layer, while user preferences are persisted through Chrome Storage.

---

## 🧰 Tech Stack

| Technology                | Purpose                   |
| ------------------------- | ------------------------- |
| **JavaScript**            | Extension logic           |
| **HTML**                  | Popup & options interface |
| **CSS**                   | UI & cosmetic filtering   |
| **Manifest V3**           | Extension architecture    |
| **declarativeNetRequest** | Network filtering         |
| **Chrome Storage API**    | Persistent settings       |
| **Content Scripts**       | Page-level filtering      |

No React.

No Node.js runtime.

No backend.

No unnecessary abstraction.

Just the browser and its extension APIs.

---

## 📦 Installation

### 1. Download

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/BipBuster.git
```

Or download the repository as a ZIP and extract it.

### 2. Open Chrome Extensions

Navigate to:

```text
chrome://extensions
```

### 3. Enable Developer Mode

Turn on:

```text
Developer mode
```

### 4. Load BipBuster

Select:

```text
Load unpacked
```

Choose the extracted BipBuster project directory.

That's it.

BipBuster is now running locally.

---

## 🔬 Learning Goals

BipBuster was created primarily as a hands-on browser-extension learning project.

The project explores:

* How Manifest V3 extensions work
* How service workers operate
* How network requests can be filtered
* How declarative filtering rules work
* How content scripts interact with webpages
* How DOM elements can be identified and hidden
* How popup pages communicate with extension logic
* How Chrome Storage persists configuration
* How permissions affect extension capabilities
* How websites and extensions interact
* Why production-grade ad blockers are significantly more complicated than they initially appear

The goal is not simply to build an ad blocker.

The goal is to understand **what actually happens inside the browser.**

---

## 🔐 Privacy

BipBuster is designed around a simple principle:

> **Your browsing data belongs to you.**

The project does not intentionally:

* Collect browsing history
* Send browsing activity to a server
* Track users
* Sell data
* Require an account
* Use a backend
* Upload browsing information

Everything is designed to run locally inside the browser.

---

## ⚠️ Limitations

BipBuster is an educational project, not a replacement for mature production-grade blockers.

Websites constantly change their HTML, JavaScript, network architecture, and advertising systems.

Therefore:

* Some advertisements may not be blocked.
* Some trackers may remain undetected.
* YouTube filtering may break when YouTube changes its implementation.
* Cosmetic selectors can become outdated.
* Blocking rules require maintenance.
* Aggressive filtering can occasionally affect legitimate website functionality.

That's not a bug in the concept.

It's one of the realities of browser-based content filtering.

---

## 🧪 Project Status

**Status:** 🟢 Active Learning Project

BipBuster is intentionally kept understandable rather than trying to compete with mature ad-blocking engines.

Future development can explore more advanced concepts such as:

```text
Advanced filter lists
        ↓
Rule optimization
        ↓
Dynamic filtering
        ↓
Element picker
        ↓
Per-site controls
        ↓
Advanced statistics
        ↓
More sophisticated filtering
```

---

## 🤝 Contributing

This project is primarily a learning experiment, but improvements, experiments, bug fixes, and educational ideas are welcome.

If you find something broken:

1. Reproduce it.
2. Inspect the browser console.
3. Check the extension service worker.
4. Inspect the network request.
5. Determine which filtering layer failed.
6. Open an issue with the findings.

Don't just say:

> "Ads aren't blocked."

Tell us **which request or element escaped the filter.**

That's much more useful.

---

## 📜 Disclaimer

BipBuster is developed for **educational and research purposes** to understand browser extension architecture, network filtering, content scripts, and web technologies.

It does not attempt to bypass DRM, authentication, paywalls, or browser security mechanisms.

Website behavior and compatibility may change over time.

---

## ⚡ The Philosophy

Most people see:

```text
Website → Advertisement
```

BipBuster asks:

```text
Website
   ↓
Request
   ↓
Rule
   ↓
Decision
   ↓
ALLOW / BLOCK
```

Because once you understand the request...

**you understand the browser a little better.**

---

# ⚡ BipBuster

### **Browse less. Block more. Learn everything.**

Built with ☕ + JavaScript + curiosity.
