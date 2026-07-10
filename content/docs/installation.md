---
title: Installation
description: Download and install Orchestra on macOS, Windows or Linux.
---

Grab the installer for your platform from the [downloads page](/downloads). Orchestra is a self-contained desktop app — the automation engine and browser ship inside it, so there is nothing else to install.

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `Orchestra-x.y.z-arm64.dmg` |
| macOS (Intel) | `Orchestra-x.y.z-x64.dmg` |
| Windows | `Orchestra-Setup-x.y.z.exe` |
| Linux | `Orchestra-x.y.z.AppImage` |

## macOS

Open the `.dmg` and drag Orchestra into Applications. Pick the build that matches your Mac: **arm64** for Apple Silicon (M1 and later), **x64** for Intel.

Orchestra builds for macOS are not yet notarized with Apple, so Gatekeeper will warn you on first launch. To open it anyway:

1. **Right-click** (or Control-click) Orchestra in Applications and choose **Open**, then confirm.
2. If macOS doesn't offer an Open button, go to **System Settings → Privacy & Security**, scroll down to the message about Orchestra, and click **Open Anyway**.

You only need to do this once — subsequent launches open normally.

## Windows

Run `Orchestra-Setup-x.y.z.exe`. Because the installer is not code-signed yet, Windows SmartScreen may show a "Windows protected your PC" dialog — click **More info**, then **Run anyway**.

## Linux

The AppImage is a single executable file. Make it runnable, then launch it:

```bash
chmod +x Orchestra-x.y.z.AppImage
./Orchestra-x.y.z.AppImage
```

If the app opens but the embedded browser area stays blank (seen on some NVIDIA and Wayland setups), launch with GPU acceleration disabled:

```bash
ORCHESTRA_DISABLE_GPU=1 ./Orchestra-x.y.z.AppImage
```

## Updates

Orchestra checks for new versions automatically. When an update is ready, a banner appears at the top of the app — no need to re-download installers by hand.

## Do I need Node.js?

Not to use the app. Node.js 18+ is only required if you [export a flow as a standalone script](/docs/code-export) and want to run it outside Orchestra.

Next: the [Quickstart](/docs/quickstart) walks you through your first flow.
