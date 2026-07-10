---
title: Form instruments
description: Click, Fill, Select, Upload and Keyboard.
---

Form instruments interact with page elements. They all take a [selector](/docs/selectors) — use **Pick selector** to point and click instead of writing one — and they all accept the element [modifiers](/docs/modifiers) (For each, Filter, Target) plus Run if, Repeat and Retry.

## Click

Clicks a button, link, or any element. Options below the selector:

- **Button** — left (default), right, or middle click.
- **Click count** — set 2 for a double-click.
- **Force** — click even if the element isn't strictly "actionable" (useful when an invisible overlay technically covers it).

If several elements match, Click acts on the first — use **Target** or **For each** to change that. Typical failures: nothing matched the selector, or the element never became clickable because it's still loading or behind an overlay.

## Fill

Types a value into an input or textarea.

- **Text to type** — supports `$variables`, and a **conditional value**: click *add condition* next to the field to switch between two values based on a JS expression.
- **Delay per key (ms)** — blank fills instantly; a number simulates real typing, one keystroke at a time. Use it on forms that react to keystrokes — autocomplete, live validation.

## Select

Chooses an option from a `<select>` dropdown by its **value** attribute. The value field supports `$variables` and conditional values. For custom (div-based) dropdowns, Select won't work — use two Clicks: open the dropdown, then click the option.

## Upload

Attaches a file to an `<input type="file">` field. Give it the path to a file on your machine. No file-picker dialog opens — the file is set directly on the input.

## Keyboard

Presses a key: `Enter`, `Tab`, `Escape`, `ArrowDown`… Combinations work too, like `Control+A` or `Shift+Tab`. The key goes to whatever currently has focus, so it usually follows a Click or Fill.
