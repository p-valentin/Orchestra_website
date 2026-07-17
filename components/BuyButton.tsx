'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { PADDLE_CONFIGURED, openPaddleCheckout } from '@/lib/paddle'

// The buy button. Buying requires a signed-in account — a signed-out visitor is
// sent to log in first. For a signed-in buyer it opens the Paddle overlay and
// binds the purchase to that account's user_id via custom_data, so changing the
// email inside Paddle can't misdirect it: a successful payment activates the
// license on the account that clicked Buy.
//
// There is deliberately NO hosted-checkout-link fallback: a static link can't
// carry the account's user_id, which would silently break exactly that binding.
// Until Paddle is configured the button renders disabled — an honest "not open
// yet" beats navigating somewhere unrelated.
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

      await openPaddleCheckout({
        email: data.session.user.email ?? undefined,
        userId: data.session.user.id,
        // /account watches for ?checkout=success and polls the license into
        // view, so the buyer never sees "No license yet" right after paying.
        successUrl: `${window.location.origin}/account?checkout=success`,
      }).catch(() => window.location.assign('/#contact')) // Paddle blocked: don't dead-end
    } finally {
      setBusy(false)
    }
  }

  if (!PADDLE_CONFIGURED) {
    return (
      <button type="button" className={className} disabled title="Checkout isn’t open yet">
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
