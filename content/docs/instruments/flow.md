---
title: Flow instruments
description: Cue, Group, Condition, Each, While, Try/Catch and friends.
---

Flow instruments give a flow structure: branches, loops, error handling, and clean endings. Most of them are **containers** — drag other steps inside them, or record straight into them with the [recording modes](/docs/recording).

## Cue

A background watcher: while the flow runs, the cue polls for its condition, and the moment it becomes true its child steps fire — cookie banners, chat popups, login walls, surprise errors. Cues are rich enough to have [their own page](/docs/cues); the short version:

- Seven trigger types — selector exists, element visible, URL matches, URL changed, page text, network response, page error.
- **Max times to fire** (default 1, `0` = unlimited) and **After firing**: resume where the flow was, or continue past the cue.
- Cooldowns, fire timeouts and a failure circuit-breaker for unattended runs.

## Group

Purely organizational: collects steps under a label so long flows read like an outline. Its **On error** setting (stop / continue / skip) applies to the group as a unit.

## Condition

Runs its children only if a condition is true — otherwise the whole block is skipped. Three modes:

- **Builder** — pick a left side, an operator (`equals`, `>`, `contains`, `is empty`…) and a right side. Both sides accept a variable (`myVar` or `$myVar`) or a literal (`42`, `true`, `"hello"`). No code.
- **Code** — any JavaScript expression with `inputs` (your variables) in scope: `inputs.count > 5 && inputs.role === "admin"`.
- **Element** — check the page: run the block only when an element is visible / hidden / exists / doesn't exist. Perfect for optional dialogs and A/B layouts.

The live preview evaluates the condition against the current state and tells you whether the children would run.

## Each

Runs its children once per item. Two modes:

- **Elements** — loop over every element a selector matches. Child steps are *scoped to the current element*: a child Extract with selector `h3` reads each card's own title, not the page's first `h3`. The item variable holds the loop index.
- **List** — iterate an array variable (a CSV import, a list Extract, a Fetch result). The item variable holds the current item: `$item`, `$item.email`.

Two patterns cover most jobs: *Each over `.product-card` → Extract → Output* (one row per card), and *Extract a list of links → Each → Navigate to `$item` → Extract* (visit every page). The item variable is scoped — an outer variable with the same name is restored when the loop ends.

## While

Repeats its children as long as a condition holds. Same three modes as Condition — **builder**, **code**, and **element**, where the loop keeps going while an element is visible/hidden/present/absent. Element mode is made for pagination: *While `button.next` exists → Click it → extract the page*.

The condition is re-evaluated before each pass, and a safety cap of **10,000 iterations** stops runaway loops.

## Try / Catch

Runs its children; if any step throws, the error is handled instead of halting the flow. **On error**:

- **Ignore** — swallow it silently.
- **Log** — print it to the console and continue.
- **Set variable** — store the error message in a variable for later steps to inspect.
- **Custom** — run your own JS in the catch block (the error is available as `err`). Custom catch code runs in exported scripts.

Use it around steps you *expect* to fail sometimes: optional page sections, flaky endpoints, anti-bot interstitials. For a single step, the simpler [On failure: continue](/docs/modifiers) setting may be all you need.

## Snippet

Runs a saved [snippet](/docs/cues) inline at this position. Pick which snippet in the config panel; the snippet's steps execute as if they were pasted here. Edit the snippet once, and every place it's used picks up the change.

## Comment

A no-op annotation. It does nothing at runtime — it's documentation inside the flow, and it survives the round trip into [exported code](/docs/code-export) as a `//` comment.

## Pause

Halts the run until you click **Resume** in the toolbar — for manual steps mid-flow: solve a captcha, complete a 2FA prompt, eyeball the page before an irreversible action. In an exported script it becomes a "press Enter to continue" prompt in the terminal.

## Stop / Success / Fail

Explicit endings, usually placed inside a Condition or Cue:

- **Stop** — end the run here, no error. "We're done" branches.
- **Success** — end the run and mark it successful, with an optional message. Short-circuit once the goal is reached.
- **Fail** — end the run as an error with your message. Guard invariants: *if not logged in → Fail "login required"* beats silently scraping the wrong page.
