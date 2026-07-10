---
title: Data instruments
description: Extract, Evaluate, Transform, Value and Output.
---

Data instruments move values in and out of [variables](/docs/variables): read from the page, compute, reshape, and report. All of them show a **live preview** in the config panel — what the step *would* produce against the current page, before you run anything.

## Extract

Reads from the page and saves the result to a variable. **What to read**:

| Source | Reads |
| --- | --- |
| `text` | the element's text content |
| `attribute` | an HTML attribute (`href`, `src`, `alt`…) |
| `property` | a live DOM property — `el.href` gives the *absolute* URL, `el.checked` a boolean |
| `value` | the current value of an input / select / textarea |
| `html` | the element's `innerHTML` or `outerHTML` |
| `count` | how many elements match the selector |
| `pageUrl` / `pageTitle` / `pageHtml` | the page's URL, title, or full HTML — no selector needed |
| `storage` | a `localStorage` / `sessionStorage` key, or a cookie value |

**Mode** controls how much you read. `single` reads the first match. `list` reads *every* match into an array — all the links on a page, every price in a table.

**Build a JSON object** turns Extract into a structured scraper: add named fields, each with its own selector and source, and the result is an object (or, in list mode with a container selector, an array of objects — one per card, row, or listing):

```json
[
  { "name": "title", "selector": "h2" },
  { "name": "link", "selector": "a", "source": "property", "prop": "href" }
]
```

Fields can nest, so one Extract can capture a whole page's structure in a single step. A **Transform result** dropdown applies quick post-processing (`trim`, `parseInt`, `JSON.parse`…) to single string results.

If a list extract returns rows of `null`, the usual culprit is pointing at the row instead of the element that holds the value — ask for `href` on the `<a>`, not on the `<tr>` around it.

## Value

Sets or updates a variable — no code needed.

- **Operation**: `=` assign, `+=` `-=` `*=` `/=` arithmetic, `append` / `prepend` string concatenation.
- **Value type**: `auto` (best-effort: `42` → number, `true` → boolean, `[1,2]` → array), or force `text`, `number`, `boolean`, `null`, `JSON`.

Classic uses: a counter (`count += 1` inside an Each loop), building URLs piece by piece, resetting state between cue fires.

## Output

Logs a value to the **Output tab** — and optionally writes it to disk. The value field takes anything: `$myVar`, literal text, or text with `$vars` inside it; an optional label keeps the output readable.

**Export to file** writes JSON or CSV (arrays of objects become rows with headers; arrays of primitives a single column). **Mode** is overwrite or **append** — append accumulates across runs and loop iterations, ideal inside an Each. **Export when** gates the file write on an expression like `$items.length > 0` (it logs either way). Files go to `~/Documents/Orchestra/data/` by default — see [Output & data](/docs/output-data).

## Evaluate

Runs JavaScript **in the page** — full access to `document` and `window`, like typing in the DevTools console. Give it an expression or arrow function; the return value can be saved to a variable:

```js
() => document.querySelectorAll('a').length
```

Evaluate runs in the page context, so it **cannot** see your `inputs`/variables. When you need both the page and your variables in one script, use [Script](/docs/instruments/advanced) instead — it runs in Node with both in scope.

## Transform

Reads a variable, applies a function, writes the result to a variable (the same one or a new one).

Built-in operations cover the common cases: `trim`, `toLowerCase` / `toUpperCase`, `toString`, `parseInt`, `parseFloat`, `length`, `JSON.parse` / `JSON.stringify`, `split`, `replace`, `slice`, `reverse`. **Custom** mode takes any arrow function — it receives `(value, inputs)` so you can mix in other variables:

```js
(value, inputs) => value.filter(row => row.price > inputs.minPrice)
```

> **Security note:** custom Transform functions run in a Node `vm` context that is *not* a security sandbox. That's why the [import safety scan](/docs/workspaces) flags them in workspaces you open from disk.
