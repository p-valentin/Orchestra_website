'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Keeps /admin current without anyone pressing reload.
//
// router.refresh() rather than a location reload or a <meta refresh>: it
// re-fetches the server components and reconciles, so scroll position, open
// <details> panels and client state all survive. A hard reload would throw away
// a half-written reply every fifteen seconds, which is the opposite of useful
// on the one page where the text being typed is a message to a customer.
//
// It pauses rather than fighting the user. Two cases, both about not moving the
// page out from under someone:
//
//   - the tab is in the background. A forgotten admin tab should not poll all
//     night; nothing it displayed was urgent an hour ago either. It refreshes
//     once on the way back, so returning to the tab shows current data.
//   - there is unsent text in the compose or reply box. Reconciliation should
//     preserve it, but "should" is doing a lot of work in a sentence about
//     someone's half-written apology to a customer, and the cost of waiting is
//     that a thread list is fifteen seconds stale.

const INTERVAL_MS = 15_000

// Only the forms that are marked. Checking every input on the page would be
// wrong: the release, blog and licence forms are pre-filled from server data,
// so they always look "in progress" and polling would never run on those tabs.
const GUARD = '[data-guard-refresh]'

function hasUnsentText(): boolean {
  for (const form of document.querySelectorAll<HTMLElement>(GUARD)) {
    for (const field of form.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('textarea, input')) {
      if (field.type !== 'hidden' && field.value.trim()) return true
    }
  }
  return false
}

export default function AdminAutoRefresh() {
  const router = useRouter()
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      if (hasUnsentText()) {
        setHeld(true)
        return
      }
      setHeld(false)
      router.refresh()
    }

    const timer = setInterval(tick, INTERVAL_MS)
    // Coming back to the tab should show current data immediately rather than
    // whatever was true when it was last in front.
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  // Said out loud, because a page that changes on its own without explanation
  // reads as a glitch — and because "why did that thread move" has an answer.
  return (
    <span className="font-mono text-xs text-faint" aria-live="polite">
      {held ? 'auto-refresh paused · draft open' : 'auto-refreshing'}
    </span>
  )
}
