---
title: Troubleshooting
description: Fixes for the most common bumps.
---

Orchestra translates raw automation errors into plain-English messages with hints, so the console is always the first place to look. This page covers the problems those messages point at — and the app-level ones that happen before any flow runs.

## The app won't open

- **macOS** — unsigned-build warning: right-click the app → **Open**, or **System Settings → Privacy & Security → Open Anyway**. Details in [Installation](/docs/installation).
- **Windows** — SmartScreen: **More info → Run anyway**.
- **Linux** — the AppImage needs `chmod +x` first.

## The browser area is blank

On some Linux setups (NVIDIA, Wayland) the embedded browser renders blank. Launch with GPU acceleration disabled:

```bash
ORCHESTRA_DISABLE_GPU=1 ./Orchestra-x.y.z.AppImage
```

If the browser view goes blank after closing a dialog or resizing, dragging any panel divider forces a redraw.

## "Browser disconnected"

The green dot in the browser toolbar turns into a red **Reconnect** button when the automation browser detaches. Click it. If the browser ends up in a bad state — stale cookies, stuck page — **Reset** in the toolbar clears cache, cookies and storage and starts from a blank page.

## "No element matched the selector"

The most common failure, and usually one of three things:

1. **The element isn't there yet.** Pages load asynchronously — put a [Wait](/docs/instruments/checks) before the step, or use Navigate's `networkidle` option.
2. **The selector broke.** Sites change. Select the step and check the [match-count badge](/docs/selectors); re-pick the element or choose a sturdier candidate from the alternatives.
3. **The element is in an iframe or shadow DOM.** Wrap the steps in a [Frame](/docs/instruments/browser) container, or pierce shadow roots with `>>>` in a CSS selector.

## "Multiple elements matched"

The selector isn't specific enough for a strict action. Either refine it, or tell the step which match you mean with the [Target modifier](/docs/modifiers) (first / last / nth) — often easier than fighting the selector.

## "Timed out after Ns"

Something never reached the expected state. For navigations: raise the timeout or switch **Wait until** to `domcontentloaded`. For elements: a Wait step with a generous timeout beats a slow default everywhere else. If a step fails only *sometimes*, add [Retry](/docs/modifiers) — intermittent timeouts on slow pages are exactly what it's for.

## "Page navigated away mid-execution"

A click triggered a navigation while the step was still working. Split it up: let the Click finish, then put page-touching steps after a Wait or Wait Network — don't read from a page that's mid-navigation.

## "Click blocked — another element is covering the target"

A cookie banner, modal or sticky header is over the element. Add a [Cue](/docs/cues) to dismiss whatever pops up, scroll the element into view first, or use Click's **Force** option if the overlay is purely cosmetic.

## Dialog Handler or Intercept "does nothing"

Both only take effect in [exported scripts](/docs/code-export) — the embedded browser's CDP connection doesn't surface JS dialogs or support request interception. In the app, Dialog Handler arms without firing and Intercept fails with a message saying so.

## The exported script won't run

Exported scripts need Node.js 18+ and Playwright:

```bash
npm install playwright
node my-flow.js
```

If Chromium itself is missing, `npx playwright install chromium` fetches it.

## Where did my files go?

Screenshots default to `~/Documents/Orchestra/screenshots/`, data exports to `~/Documents/Orchestra/data/`. The console logs the resolved absolute path after every write — check the run's log entries.

## Reporting a bug

The **💬** feedback button in the toolbar goes straight to the developer. For crashes and weird behavior, attach the log file — its path is in **Settings → Developer → Log file** ([details](/docs/settings)).
