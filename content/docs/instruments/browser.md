---
title: Browser instruments
description: Navigate, tabs, screenshots, scrolling, frames and dialogs.
---

Browser instruments drive the browser itself: where it goes, which tab is active, and what it captures. Each heading below is linkable — share `#screenshot` to point someone at a specific instrument.

## Navigate

Opens a URL. Use `$variables` anywhere in the URL — `https://example.com/$lang/login`.

- **Timeout** — default 30000 ms.
- **Wait until** — when the step counts as done: `load` (full page load), `domcontentloaded` (faster, before images), or `networkidle` (waits for network traffic to settle — good for single-page apps).
- **Referer URL** — sent as the `Referer` header for this navigation.
- **Stealth** — normalizes the most obvious automated-session properties (`navigator.webdriver`, missing plugins). Light coverage only; for the full set, see [Stealth](/docs/instruments/session-environment#stealth).

Only `http://` and `https://` URLs are allowed — anything else is blocked before it loads. If navigation times out, try a longer timeout or `domcontentloaded`.

## Go Back / Go Forward

Move through browser history, exactly like the browser buttons. One field each: **Timeout** (default 10000 ms).

## Reload

Refreshes the current page, with the same **Timeout** (default 30000 ms) and **Wait until** options as Navigate.

## Switch Tab

When a click opens a new tab or popup, the flow keeps targeting the old tab until you switch. After Switch Tab, all following steps operate on the selected tab.

| Mode | Selects |
| --- | --- |
| `latest` | the most recently opened tab — the common case right after a click opens one |
| `first` | the original tab |
| `byUrl` | the first tab whose URL matches a regex |
| `byTitle` | the first tab whose title matches a regex (slower — reads each tab's title) |
| `byIndex` | by position, 0-based |

If nothing matches, the step fails with a clear message and focus stays where it was. If the new tab is still opening, put a short Sleep or a Wait before the switch.

## Close Tab

Closes a tab: the **current** one, the first matching a **URL regex**, or one **by index**. When the active tab closes, focus falls back to the most recently opened remaining tab automatically, so the next steps still have a page to work on. In the app the last remaining tab is never closed.

The classic popup dance: Click (opens popup) → Switch Tab `latest` → work in the popup → Close Tab `current` — and you're back in the original tab.

## Screenshot

Saves a PNG of the current page. The **Save as** field accepts (with `$variables` interpolated):

- a bare filename (`login.png`) → saved to `~/Documents/Orchestra/screenshots/`
- a relative path with slashes (`./out/login.png`) → resolved from the working directory
- an absolute path (`/tmp/x.png`) → used as-is

**Capture full page** grabs the entire scrollable page instead of the viewport. The resolved absolute path is logged in the console after every shot — no hunting for the file.

## Scroll

Scrolls the page by a pixel offset — **Horizontal** and **Vertical** in px. Negative values scroll up / left. For infinite-scroll pages, combine with [Repeat or a While loop](/docs/modifiers).

## Dialog Handler

Arms a one-shot handler for the *next* JavaScript dialog (`alert`, `confirm`, `prompt`): **accept** it (optionally typing text into a prompt) or **dismiss** it. Place it *before* the step that triggers the dialog.

> **Exported scripts only.** The embedded browser doesn't surface JS dialog events, so this instrument only takes effect in [exported Playwright scripts](/docs/code-export). In the app it arms without firing.

## Frame

A container that enters an iframe: every child step — Click, Fill, Extract — targets elements *inside* the frame until the block ends. Match the frame by:

- **Selector** — CSS for the iframe element (`iframe[name="checkout"]`, `iframe[src*="stripe"]`)
- **Name** — the frame's `name` attribute
- **URL** — regex against the frame's URL
- **Index** — 0-based position

Payment forms (Stripe et al.) are the classic use. For shadow DOM you usually don't need Frame at all — CSS selectors pierce shadow roots with `>>>` (see [Selectors](/docs/selectors)).
