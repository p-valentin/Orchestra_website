---
title: Check instruments
description: Assert, wait and sleep — keep flows honest and in sync.
---

Checks keep a flow synchronized with the page and catch problems where they happen instead of three steps later. A well-placed Wait is the cure for most "flaky" automations; a well-placed Assert turns a silent wrong result into a loud early failure.

## Assert

Verifies an element matches a condition — and fails the step if it doesn't.

- **Condition**: `equals`, `contains`, `not contains`, `starts with`, `ends with`, `matches regex`, `is visible`, `is hidden`.
- **Expected value** — supports `$variables` and conditional values. For inputs, selects and textareas, the comparison uses the field's current *value*; for everything else, its text.
- **Timeout** — default 5000 ms (used by the visibility conditions).

The live preview shows whether the assertion would pass right now. On failure, the error reports what was expected and what the page actually had.

## Assert URL

Verifies the browser is on the right page: fails unless the current URL matches the pattern (a substring or regex, like `/dashboard`). Cheap insurance after a login or a Switch Tab — if you ended up somewhere unexpected, better to fail here than to scrape the wrong page.

## Wait

Waits until an element reaches a state before continuing:

- **Becomes**: `visible`, `hidden`, `attached` (exists in the DOM), or `detached` (removed).
- **Give up after** — default 10000 ms; the step fails if the state is never reached.

Waiting for a loading spinner to become `hidden` is the classic move on slow, dynamic pages.

## Wait Network

Waits for network activity instead of DOM state:

- `networkidle` — no network traffic for a moment (good after actions that trigger background loading)
- `load` / `domcontentloaded` — page load states
- `request` — a request whose URL matches a substring or regex is *sent*
- `response` — a matching response arrives, optionally with a specific HTTP status

Use `response` mode when a click fires an API call and you want to continue exactly when the data is back — more precise than sleeping.

## Sleep

Pauses for a fixed number of milliseconds. Honest and simple — but prefer Wait or Wait Network when there's a real condition to wait for: fixed sleeps are either too short (flaky) or too long (slow).
