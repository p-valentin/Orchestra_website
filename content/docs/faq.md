---
title: FAQ
description: Short answers to common questions.
---

## Is Orchestra free?

No. There's a **14-day free trial** with every feature unlocked and no card required. After that, Orchestra is a one-time **$149** license: no subscription, no per-run fees, and it covers the updates that follow. The app is on the [downloads page](/downloads); [pricing](/#pricing) has the details.

## What do I need to run it?

A Mac (Apple Silicon or Intel), a Windows PC, or a Linux machine. That's it — the automation engine and browser are bundled. Node.js is only needed to run [exported scripts](/docs/code-export) outside the app.

## Do I need to know how to code?

No. Flows are built visually, and [recording](/docs/recording) writes the steps for you. Code shows up only where you invite it — a Condition expression, a custom Transform, a Script step — and the [code view](/docs/code-export) is there when you want it.

## Does it work on any website?

Orchestra drives a real Chromium browser, so anything that works in Chrome works in the embedded browser: logins, iframes, multi-tab flows, file uploads. Two honest caveats: some sites detect and block automated sessions regardless of the [session & environment instruments](/docs/instruments/session-environment), and heavily obfuscated pages can make [stable selectors](/docs/selectors) harder to find.

## Is my data private?

Your flows, variables, and everything they extract live in local files on your machine — automation runs locally, and Orchestra has no server that sees your data. The app sends anonymous crash reports (via Sentry) to help fix bugs, without personal identifiers attached, and checks the download server for updates. That's the full list.

## Do I own the scripts I export?

Yes. Exports are plain Playwright scripts with no dependency on Orchestra — run them, schedule them, commit them, ship them. They're yours.

## Can I share a flow with someone?

Send them the workspace `.json` file ([Workspaces](/docs/workspaces)). When they open it, Orchestra's import safety scan shows any code-execution steps inside before anything loads — so make an honest flow and it's a two-click import.

## What am I responsible for when I automate a site?

Everything your automations do. What's legal depends on what you scrape, where you live, and the site's terms — Orchestra is a tool, and how you use it is your responsibility. Respect sites' terms of service, rate limits and robots conventions, and be especially careful with personal data. Our [Acceptable Use Policy](/acceptable-use) spells this out.

## How do updates work?

Orchestra checks for updates automatically and shows a banner in the app when a new version is ready. Release notes live on the [releases page](/releases).

## Where do I ask something these docs don't answer?

The **💬** feedback button in the app, or [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).
