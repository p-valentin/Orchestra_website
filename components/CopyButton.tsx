'use client'

import { useRef, useState } from 'react'

// Minimal clipboard button for the admin panel (license keys). Falls back to
// selecting nothing special — clipboard API is available everywhere the admin
// runs (HTTPS in prod, localhost in dev).
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — leave the label unchanged so it reads as a no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`font-mono text-xs ${copied ? 'text-ok' : 'text-faint hover:text-brass-bright'}`}
    >
      {copied ? 'copied ✓' : label}
    </button>
  )
}
