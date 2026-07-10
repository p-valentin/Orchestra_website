---
title: Quickstart
description: Build and run your first automation in about five minutes.
---

This walkthrough builds a tiny scraper: open a page, pull a quote out of it, and log the result. You'll touch every core part of Orchestra on the way — the palette, the embedded browser, selectors, variables and the run controls.

## 1. Open a page

Launch Orchestra. The center panel is a real embedded browser. Type `quotes.toscrape.com` into its address bar and press Enter — this site is made for scraping practice.

Browsing by hand is fine for exploring, but a flow needs its own **Navigate** step so it always starts from the right page:

1. In the left palette, find **Navigate** (Browser category) and click it. A step appears in the flow panel.
2. Select the step and set its URL to `https://quotes.toscrape.com` in the config panel on the right.

## 2. Extract some text

1. Add an **Extract** step from the Data category.
2. In the config panel, click **Pick selector**. The embedded browser enters picking mode — hover highlights elements.
3. Click the first quote on the page. Orchestra fills in the most robust selector it can find (a popover offers alternatives if you want a different one).
4. Give the extracted value a variable name: `quote`.

## 3. Log the result

Add an **Output** step (Data category) and set its value to `$quote`. Anything you write with a `$` prefix reads a [variable](/docs/variables).

## 4. Run it

Press **Start** in the top-right. The flow runs top to bottom: each step lights up as it executes, the browser navigates, and when it finishes the **Output** tab of the bottom panel shows your quote.

![The finished quickstart flow after a successful run](/docs-assets/quickstart-run.png)

That's the whole loop: add steps, point them at the page, run, read the output.

## Prefer not to build by hand?

Click **Orchestrate** in the browser toolbar and just use the page — Orchestra records your clicks, typing and navigation as steps automatically. See [Recording](/docs/recording).

## Where to go next

- [The interface](/docs/interface) — what every panel does.
- [Selectors](/docs/selectors) — how Orchestra finds elements, and how to pick good ones.
- [Running flows](/docs/running) — stepping, pausing, and running from a specific step.
- [Output & data](/docs/output-data) — exporting scraped data to JSON or CSV.
