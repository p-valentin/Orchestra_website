'use client'

// First-touch attribution, client side, no identifiers.
//
// Why this exists: the download link points at our own /api/download, so by the
// time that request arrives its `referer` header is orchestra-automation.com —
// the channel that actually sent the visitor is only visible on the FIRST page
// they landed on. Without carrying it forward, every install buckets as
// "direct" and the download numbers cannot be attributed to anything.
//
// What is stored: one string, in sessionStorage, holding a source label like
// "reddit" or "news.ycombinator.com". It is not an identifier, it does not
// persist past the tab, and it is never combined with anything that could
// identify a person — the server only ever increments a per-day counter.
//
// `utm_source` wins over the referrer header because the header is the less
// reliable of the two: Reddit and HN links opened from mobile apps, and any
// site sending `Referrer-Policy: no-referrer`, arrive with nothing at all. A
// tagged URL is the only attribution that survives those paths.

const KEY = 'orchestra_src'

function clean(value: string): string {
  return value
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.\-_]/g, '')
    .slice(0, 100)
}

// Call once per session, on the first page seen. Later calls do not overwrite:
// first touch is the interesting one, and an internal navigation must never
// relabel a Reddit visitor as direct.
export function captureSource(): void {
  try {
    if (sessionStorage.getItem(KEY)) return

    const utm = new URLSearchParams(window.location.search).get('utm_source')
    if (utm) {
      sessionStorage.setItem(KEY, clean(utm))
      return
    }

    if (!document.referrer) return
    const host = new URL(document.referrer).hostname
    if (!host || host.includes(window.location.hostname)) return
    sessionStorage.setItem(KEY, clean(host))
  } catch {
    // Private mode, disabled storage, malformed URL — attribution is a
    // nice-to-have, never a reason to break a page or block a download.
  }
}

export function readSource(): string {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}
