---
title: Selectors
description: How Orchestra finds elements — picking, selector types and alternatives.
---

Every instrument that touches the page — Click, Fill, Extract, Assert, Wait and friends — needs a **selector**: a description of which element to act on. Orchestra can write selectors for you, and gives you full control when you want it.

## Picking from the browser

Select a step and click **Pick selector** in the config panel. The embedded browser enters picking mode: elements highlight as you hover, a click chooses one, and Esc cancels. Orchestra generates several candidate selectors for the element, tests how many elements each one matches, and fills in the most robust unique candidate.

The **Alternatives** popover then lists every candidate with its type and live match count — `✓ unique` in green, or `3×` in amber when it matches several elements. Click any row to use that selector instead. A count badge under the selector field keeps showing how many elements the current selector matches on the live page, so you'll notice immediately if an edit breaks it.

The generator prefers attributes that survive page changes — test ids, labels, stable ids — and skips auto-generated class names and volatile ids.

## Selector types

The row of toggles under the selector field sets how the text is interpreted. Each type maps to a Playwright locator:

| Type | Matches | Playwright equivalent |
| --- | --- | --- |
| `css` (default) | a CSS selector | `page.locator(sel)` |
| `xpath` | an XPath expression | `page.locator('xpath=' + sel)` |
| `text` | elements containing the text | `getByText(sel)` |
| `text (exact)` | elements whose text is exactly this | `getByText(sel, { exact: true })` |
| `text (partial)` | same as `text` — substring match | `getByText(sel)` |
| `label` | form controls by their label | `getByLabel(sel)` |
| `placeholder` | inputs by placeholder text | `getByPlaceholder(sel)` |
| `testid` | elements by `data-testid` | `getByTestId(sel)` |

## Shadow DOM

CSS selectors can pierce shadow roots with `>>>`. For example `my-widget >>> button` finds a button inside the shadow DOM of `<my-widget>`. Use it for web-component-heavy sites where a plain CSS path stops at the shadow boundary.

## List selectors

Instruments that act on many elements at once — Extract in list mode, the Each container — use **Pick list selector**. Click *one* item of the repeated group in the browser, and Orchestra generalizes to a selector matching the whole group. The match-count badge tells you how many items it found.

## When several elements match

A selector doesn't have to be unique. By default a step acts on the **first** match; the [Target modifier](/docs/modifiers) switches to the last or the *n*-th, **Filter** narrows matches by text or visibility, and **For each** repeats the step over every match.

## Writing selectors that last

- Prefer `testid`, `label` and `placeholder` — they express intent and rarely change.
- Prefer short CSS anchored on ids or semantic attributes over long descendant chains.
- Avoid selectors built from framework-generated class names (`css-1x2y3z`); they change on every deploy. The picker already avoids these, but pages sometimes offer nothing better — in that case a `text` selector is often the most stable choice.
- If a step fails with "no elements found", the [count badge and alternatives](/docs/troubleshooting) are the fastest way to diagnose it.
