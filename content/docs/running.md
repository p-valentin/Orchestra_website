---
title: Running flows
description: Start, step, pause and stop — all the ways to run a flow.
---

Flows run top to bottom. While a run is in progress, each step in the flow panel shows a live status — running, success with its duration, or error with a plain-English message — and the console logs every event.

## The run controls

| Control | What it does |
| --- | --- |
| **Start** | Runs the whole flow from the first step |
| **Continue** | Runs from the selected step onward |
| **Run to here** | Runs everything *before* the selected step, then stops — perfect for getting the page into position while you build the next part |
| **Stop** | Aborts the run |
| **Resume** | Unblocks a run paused by a Pause step |
| **Reset** | Clears step statuses and runtime variables, wipes the browser's cache, cookies and storage, and returns to a blank page |

Continue and Run to here work at the top level of the flow: if the selected step is inside a container, the run slices at the container. Every run entry point clears runtime variables and cue history first, so runs don't contaminate each other.

## Running a single step

With a step selected, the bottom of the config panel offers:

- **Play this instrument** — runs just that step against the current page.
- **Step** — runs it and, if it succeeds, advances the selection to the next step.

Play and Step are the core of the building workflow: get the page where you want it, add a step, play it, adjust, step forward.

## Pacing

Two toolbar toggles slow a run down:

- **Debug** — a fixed 800 ms delay between steps so you can watch what's happening.
- **🎲 Human delay** — a random delay between actions (default 500–2000 ms, editable). This is a light bot-detection countermeasure as much as a pacing tool — see [Human-like instruments](/docs/instruments/human-like).

## The Runner window

**Runner** in the toolbar opens a stripped-down window with just the variables and a console — no editor. It stays in sync with your workspace, so it's the right surface for actually *using* a finished automation: set inputs, press run, read output, without the risk of nudging a step.

## Pauses and failures

- A **Pause** step halts the run (and shows **Resume** in the toolbar) — useful for flows with a manual step in the middle, like solving a captcha or reviewing before submit.
- What happens when a step fails is per-step: **On failure** is either stop (default) or continue — see [Step modifiers](/docs/modifiers). **Stop**, **Success** and **Fail** steps end the run explicitly from within the flow.
