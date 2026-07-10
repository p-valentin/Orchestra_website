---
title: Recording
description: Let Orchestra write steps for you while you use the page.
---

The fastest way to build a flow is to record it. Click **Orchestrate** in the browser toolbar and use the page like a person would — click, type, press keys, navigate. Each action becomes a step in the flow, with a robust selector already picked for you. Click **Stop** when you're done.

While recording, a red toolbar appears under the address bar. It shows a step counter, the label of the last recorded step, and the recording tools.

## Recording modes

The default mode records **actions** — clicks, typing and key presses. The other modes change what your *next click* means: instead of performing an action, clicking an element creates a specific kind of step. Click a mode to arm it; click it again to return to action mode.

| Mode | Clicking an element… |
| --- | --- |
| Action (default) | records clicks, typing and keys as they happen |
| Assert | adds a check that the element's text/visibility is what it is now |
| Extract | saves the element's text to a variable |
| Hover | records a mouse hover over it |
| Wait | waits until the element is visible |
| If | starts a conditional block — the following steps run only if the element is visible |
| Each | click one item of a repeated list — the following steps loop over every match |
| While | starts a loop — the following steps repeat while the element is visible |

The If, Each and While modes create container steps and drop you *inside* them: everything you record next lands in the container. When you're done, press the **out** button (it appears whenever you're inside a container) to step back out — recording continues after the container.

## Insert buttons

Four buttons insert a step directly, no page interaction needed: **Screenshot**, **Sleep** (1 second), **Go Back** and **Go Forward**.

## Fixing mistakes

- **Undo** (↩) removes the last recorded step.
- **Pause** (⏸) stops recording temporarily — browse freely without adding steps — then resume.
- Every recorded step is a normal step: select it afterwards to change its selector, values or [modifiers](/docs/modifiers).

Recording uses the same selector heuristics as [picking](/docs/selectors), preferring stable attributes over brittle auto-generated ones. It's still worth skimming the recorded selectors before relying on a flow — see [Selectors](/docs/selectors) for what makes a good one.
