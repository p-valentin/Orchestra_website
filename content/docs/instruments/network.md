---
title: Network instruments
description: Fetch requests with the browser's cookies, and intercept traffic.
---

## Fetch

Sends an HTTP request directly — GET, POST, PUT, DELETE or PATCH — and saves the response to a variable.

Two properties make Fetch more useful than calling an API from the page:

- **It runs from Node, not the page**, so it is not subject to the page's CORS policy. Any API you can reach, you can call.
- **It shares the browser's context and cookies.** If your flow logged into a site, Fetch calls that site's API as the logged-in user — no tokens to copy around.

Fields:

- **URL** and **Method**.
- **Body** — JSON or a plain string (sent for everything except GET).
- **Headers** — a JSON object, e.g. `{ "Accept": "application/json" }`.
- **Parse response as** — `json` (decoded into an object), `text`, or `none`.
- **Save result as** — the variable that receives the parsed response.

The console shows the HTTP status after each call. A typical pattern: log in through the UI once, then Fetch the site's own JSON API for the data — far faster and more reliable than scraping the DOM.

## Intercept

Registers a rule for matching network requests: **abort** (block) or **continue** (allow). The **URL pattern** is a glob — `**/api/**`, `**/*.png`. Blocking images, analytics or ad scripts can speed up heavy pages considerably.

> **Exported scripts only.** The embedded browser's CDP connection doesn't support request interception — in the app this step fails with a message saying so. In an [exported Playwright script](/docs/code-export) it works as configured.
