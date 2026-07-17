'use client'

import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { CHECKOUT_URL, CHECKOUT_CONFIGURED } from '@/lib/checkout'
import { PADDLE_CONFIGURED, openPaddleCheckout } from '@/lib/paddle'

// The buy button. Buying requires a signed-in account — a signed-out visitor is
// sent to log in first. For a signed-in buyer it opens the Paddle overlay (or a
// checkout link) and binds the purchase to that account's user_id via
// custom_data, so changing the email inside Paddle can't misdirect it: a
// successful payment activates the license on the account that clicked Buy.
//
// The session is read at click time, so the decision is never stale.
export default function BuyButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  async function onBuy() {
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

    if (PADDLE_CONFIGURED) {
      await openPaddleCheckout({
        email: data.session.user.email ?? undefined,
        userId: data.session.user.id,
        successUrl: typeof window !== 'undefined' ? `${window.location.origin}/account` : undefined,
      }).catch(() => window.location.assign('/#contact')) // Paddle blocked: don't dead-end
      return
    }

    if (CHECKOUT_CONFIGURED) {
      window.location.assign(CHECKOUT_URL)
      return
    }

    // No payment path configured yet: show the pricing details rather than
    // re-prompting an already-signed-in user to log in.
    window.location.assign('/#pricing')
  }

  return (
    <button type="button" className={className} onClick={onBuy}>
      {children}
    </button>
  )
}
