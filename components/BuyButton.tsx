'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { POLAR_CONFIGURED, openPolarOverlay } from '@/lib/polarCheckout'
import { PAID_ENABLED } from '@/lib/launch'

// Buy is live only when it's both switched on (the launch flag) and wired (the
// Polar product id). Until then the button renders disabled — an honest "not
// yet" beats sending a click into a checkout that isn't verified.
const CHECKOUT_LIVE = PAID_ENABLED && POLAR_CONFIGURED

// The buy button. Buying requires a signed-in account — a signed-out visitor is
// sent to log in first. For a signed-in buyer it asks /api/checkout for a Polar
// session and opens it as an overlay.
//
// The account binding lives entirely on the server: /api/checkout verifies the
// access token sent below and puts THAT user id into checkout metadata, which
// is the only thing webhooks-polar attaches on. So changing the email inside
// Polar can't misdirect the purchase, and neither can tampering with this page.
//
// There is deliberately NO hosted-checkout-link fallback: a static link can't
// carry the account binding, which would silently break exactly that guarantee.
//
// The session is read at click time, so the decision is never stale.
export default function BuyButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [busy, setBusy] = useState(false)

  async function onBuy() {
    if (busy) return
    setBusy(true)
    try {
      let sb
      try {
        sb = supabaseBrowser()
      } catch {
        window.location.assign('/login')
        return
      }

      const { data } = await sb.auth.getSession()
      if (!data.session) {
        window.location.assign('/login') // must be signed in to buy
        return
      }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      if (!res.ok) {
        // Not configured, rate-limited, or Polar is down. Don't dead-end the
        // buyer on a dead button — send them somewhere a human can help.
        window.location.assign('/#contact')
        return
      }
      const { url } = await res.json()
      if (typeof url !== 'string') {
        window.location.assign('/#contact')
        return
      }

      // Resolves when the overlay closes; a completed purchase redirects the
      // page to /account?checkout=success before that happens.
      await openPolarOverlay(url)
    } catch {
      window.location.assign('/#contact')
    } finally {
      setBusy(false)
    }
  }

  if (!CHECKOUT_LIVE) {
    // Dimmed + not-allowed cursor so it plainly reads as disabled rather than a
    // live brass button; the label stays so the price is still visible.
    return (
      <button
        type="button"
        className={`${className ?? ''} cursor-not-allowed opacity-50 grayscale`}
        disabled
        title="Available at launch"
      >
        {children}
      </button>
    )
  }

  return (
    <button type="button" className={className} onClick={onBuy} disabled={busy} aria-busy={busy}>
      {busy ? 'Opening checkout…' : children}
    </button>
  )
}
