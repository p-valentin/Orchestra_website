'use client'

import { useEffect, useState } from 'react'
import { track } from '@vercel/analytics'
import { VERSION } from '@/lib/release'
import { readSource } from '@/lib/attribution'

type Platform = 'mac' | 'win' | 'linux'

type Props = {
  platform: Platform
  arch: 'arm64' | 'x64'
  label: string
  className?: string
  version?: string
}

const NOTICES: Record<'mac' | 'win', { intro: string; steps: string[]; note: string }> = {
  mac: {
    intro:
      'Orchestra is not yet signed with an Apple certificate, so macOS will warn you the first time you open it. Getting past that takes one extra step:',
    steps: [
      'Open the .dmg and drag Orchestra into Applications.',
      'Right-click Orchestra.app and choose Open, then confirm with Open.',
      'On macOS 15 or newer: if there is no confirm option, open System Settings → Privacy & Security, scroll down and click “Open Anyway”.',
    ],
    note: 'You only do this once — after the first launch it opens like any other app.',
  },
  win: {
    intro:
      'Orchestra is not yet code-signed, so Windows SmartScreen will show “Windows protected your PC” when you run the installer. To continue:',
    steps: [
      'Run the downloaded .exe.',
      'When the SmartScreen dialog appears, click “More info”.',
      'Click “Run anyway”.',
    ],
    note: 'This only happens for the installer — the app itself starts normally.',
  },
}

function Notice({
  platform,
  href,
  onClose,
  onDownload,
}: {
  platform: 'mac' | 'win'
  href: string
  onClose: () => void
  onDownload: () => void
}) {
  const notice = NOTICES[platform]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-notice-title"
        className="w-full max-w-md rounded-xl border border-line bg-panel p-7 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="download-notice-title" className="font-display text-2xl font-medium tracking-tight">
          Heads up before you install
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{notice.intro}</p>
        <ol className="mt-4 flex flex-col gap-2.5">
          {notice.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-fg">
              <span className="shrink-0 font-mono text-xs leading-6 text-brass">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm leading-relaxed text-muted">{notice.note}</p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            href={href}
            onClick={() => {
              onDownload()
              onClose()
            }}
            className="inline-flex items-center gap-2.5 rounded-lg bg-brass px-6 py-3 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
            </svg>
            Got it, download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line-strong px-5 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DownloadButton({ platform, arch, label, className, version = VERSION }: Props) {
  const [open, setOpen] = useState(false)
  const base = `/api/download?platform=${platform}&arch=${arch}`
  // Rendered without the source on the server and filled in after mount:
  // sessionStorage does not exist during SSR, and reading it inline would make
  // the server and client markup disagree. The consequence of an unhydrated
  // click is one download attributed as direct, not a broken download.
  const [href, setHref] = useState(base)
  const needsNotice = platform === 'mac' || platform === 'win'

  useEffect(() => {
    const source = readSource()
    setHref(source ? `${base}&ref=${encodeURIComponent(source)}` : base)
  }, [base])

  const fireTrack = () => track('download_click', { version, platform, arch })

  return (
    <>
      <a
        href={href}
        onClick={(e) => {
          if (needsNotice) {
            e.preventDefault()
            setOpen(true)
          } else {
            fireTrack()
          }
        }}
        className={
          className ??
          'inline-flex items-center gap-2.5 rounded-lg bg-brass px-6 py-3 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright'
        }
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
        </svg>
        {label}
      </a>
      {open && needsNotice && (
        <Notice
          platform={platform}
          href={href}
          onClose={() => setOpen(false)}
          onDownload={fireTrack}
        />
      )}
    </>
  )
}
