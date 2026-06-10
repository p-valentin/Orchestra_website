'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Cookieless first-party pageview counter: one beacon per navigation with the
// path and (on the first page only) the referrer hostname. No identifiers.
export default function TrackPageview() {
  const pathname = usePathname()
  const firstHit = useRef(true)

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return
    const payload = {
      path: pathname,
      ref: firstHit.current ? document.referrer : '',
    }
    firstHit.current = false
    try {
      navigator.sendBeacon('/api/hit', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
    } catch {}
  }, [pathname])

  return null
}
