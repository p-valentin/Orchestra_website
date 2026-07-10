---
title: Advanced instruments
description: Script — full Playwright and Node access in one step.
---

## Script

The escape hatch. When no built-in instrument does what you need, a Script step runs your JavaScript with the two things that matter in scope:

- **`page`** — the live Playwright [Page](https://playwright.dev/docs/api/class-page): `page.goto`, `page.locator`, `page.evaluate`, everything.
- **`inputs`** — your workspace [variables](/docs/variables). Read them, and *mutate the object* to share state with later steps: `inputs.total = 42` makes `$total` available downstream.

```js
const rows = await page.locator('.result').allTextContents()
inputs.results = rows.filter(r => r.includes(inputs.keyword))
```

Top-level `await` works. Errors bubble up and halt the run unless the step sits inside a [Try / Catch](/docs/instruments/flow) or has **On failure: continue** set. A **timeout** (default 120 s) aborts runaway code so a stuck loop fails the step instead of hanging the flow.

This is the difference from [Evaluate](/docs/instruments/data): Evaluate runs *in the page* (DOM access, no variables), Script runs *in Node* (Playwright + variables, and the full Node API).

> **Security note:** Script code runs in a Node `vm` context — that is **not** a sandbox. Scripts have your machine's full Node access. That's the point of the instrument, and it's exactly why the [import safety scan](/docs/workspaces) makes you review Script steps in any workspace you open from disk. Don't trust Script steps from sources you don't trust.

In the [code window](/docs/code-export), a Script step's code passes through to the generated script verbatim — and any hand-written code that Orchestra can't parse back into a visual instrument becomes a Script step, so nothing you write is ever lost.
