---
title: Session & environment instruments
description: Browser environment settings, mouse movement and custom headers.
---

[Use them responsibly](/acceptable-use): they exist for testing your own sites and automating flows you're entitled to automate — respect the terms of the sites you work with.

These instruments control the environment a flow runs in: the browser properties a page can read, how the pointer moves, and the headers each request carries. They pair with the [🎲 human-delay toggle](/docs/running), which adds random pauses between steps.

## Stealth

Normalizes the browser properties that identify an automated session, before the page loads:

- `navigator.webdriver` is hidden; Playwright's own markers are removed.
- Plugins, languages, platform, vendor, hardware concurrency and device memory report browser-typical values.
- The WebGL vendor and renderer are overridden (configurable).
- Optionally, a custom **user agent** and **timezone**.

Place it early — ideally the first step, before any Navigate. Some sites will still identify the session as automated regardless of these settings.

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
