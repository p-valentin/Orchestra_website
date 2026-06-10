'use client'

import { track } from '@vercel/analytics'
import { VERSION } from '@/lib/release'

type Props = {
  platform: 'mac' | 'win' | 'linux'
  arch: 'arm64' | 'x64'
  label: string
  className?: string
}

export default function DownloadButton({ platform, arch, label, className }: Props) {
  return (
    <a
      href={`/api/download?platform=${platform}&arch=${arch}`}
      onClick={() => track('download_click', { version: VERSION, platform, arch })}
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
  )
}
