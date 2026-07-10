---
title: Workspaces
description: Tabs, autosave, .json files and the import safety scan.
---

A **workspace** is one self-contained automation project: the flow's steps, its input variables, its snippets, and run settings like the human-delay. The tabs across the top of the window are workspaces — you can keep several projects open side by side.

## Working with tabs

- **＋** creates a new workspace.
- **Double-click** a tab to rename it.
- Open workspaces persist automatically between app restarts — closing Orchestra loses nothing.

## Saving to files

Workspaces save as portable `.json` files:

- **Save** writes the active workspace to disk. The first save asks where; after that, the tab is linked to its file and **auto-saves about 1.5 seconds after every change** — you can stop thinking about it.
- **Open** loads a workspace file from disk into a new tab.

The `.json` file contains everything — steps, variables, snippets — so it's the right unit for backups, version control, and sharing flows with other people.

## The import safety scan

Some instruments execute code: a Script step runs Node.js on your machine, a custom Transform likewise, an Evaluate runs JavaScript in the page. A workspace file someone sends you could hide something unpleasant in one of those.

So every file you **Open** is scanned before it loads. If it contains code-execution surfaces, Orchestra shows exactly what it found — each finding with the instrument, a preview of the code, and a severity:

- **High** — Script steps, custom Transform functions, detached steps with custom code: arbitrary Node.js on your machine.
- **Medium** — Condition or While in code mode, Run-if and conditional-value expressions: arbitrary JS expressions.
- **Low** — custom Try/Catch handlers (only run in exported scripts) and Evaluate (page context, not your machine).

Nothing loads until you review the list and choose **Trust**. If you didn't expect code in the file — or don't know the sender — cancel and look at the file first. Workspaces you created yourself load without ceremony unless they contain these surfaces from your own editing, in which case the scan is a quick reminder of what's inside.
