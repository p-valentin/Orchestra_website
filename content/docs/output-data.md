---
title: Output & data
description: Log values, watch the console and export results to JSON or CSV.
---

The bottom panel is where a run reports back. It has two tabs with different jobs: **Console** is the full technical log; **Output** is your data.

## The Console tab

Every step event gets a row: timestamp, status (running / success / error), the instrument, its duration in milliseconds, and any message. Errors are translated into plain English with hints, and error rows are tinted so they're easy to spot in a long run. Hover any row to copy it; the header buttons copy or clear the whole log.

## The Output tab

The Output tab collects only what **Output** steps emit — the values you actually care about, without the noise. Values print with their optional label; JSON pretty-prints with syntax highlighting; every value has a copy button. When new output arrives while you're looking at the Console tab, a badge on the Output tab counts what you haven't seen.

## Writing files

Two instruments write to disk:

- **Output** can export its value as **JSON or CSV** — give it a filename and pick the format. CSV works when the value is a list of objects (like the result of a list Extract), with the object keys as columns. Export can be gated on a condition, so a scheduled flow only writes when there's something worth writing.
- **Screenshot** saves PNGs.

By default files land in your documents folder, in a stable location you can find later:

| What | Default location |
| --- | --- |
| Output data | `~/Documents/Orchestra/data/` |
| Screenshots | `~/Documents/Orchestra/screenshots/` |

Both instruments also accept a full path if you want the file somewhere specific. In an [exported script](/docs/code-export), relative paths resolve against wherever you run the script instead.
