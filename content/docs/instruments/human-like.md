---
title: Human-like instruments
description: Stealth, mouse movement and custom headers.
---

Some sites treat automation with suspicion. These instruments make a flow look more like a person — masking automation fingerprints, moving the mouse, and controlling the headers you send. They pair with the [🎲 human-delay toggle](/docs/running), which adds random pauses between steps.

Use them responsibly: they exist for testing your own sites and automating flows you're entitled to automate — respect the terms of the sites you work with.

## Stealth

Applies a set of evasions that mask the most common automation fingerprints, before the page loads:

- `navigator.webdriver` is hidden; Playwright's own markers are removed.
- Plugins, languages, platform, vendor, hardware concurrency and device memory report browser-typical values.
- The WebGL vendor and renderer are overridden (configurable) — a common fingerprinting probe.
- Optionally, a custom **user agent** and **timezone**.

Place it early — ideally the first step, before any Navigate. It's solid against common off-the-shelf detection, but no stealth layer beats dedicated anti-bot vendors; combine with human delays and realistic pacing.

## Set Headers

Sets extra HTTP headers on **every** request the browser session makes from then on — a JSON object:

```json
{ "Accept-Language": "en-US,en;q=0.9" }
```

Useful for language pinning, custom `User-Agent` strings, or API keys a site expects. For a single request, use [Fetch](/docs/instruments/network) with its own headers instead.

## Move Mouse

Moves the pointer like a person would:

- With a **selector** — hover over that element (triggers hover menus, tooltips, lazy-loading).
- With **X / Y coordinates** — move to a viewport position.

Also the honest way to open hover-only menus before clicking something inside them.
