'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { CHECKOUT_URL, CHECKOUT_CONFIGURED } from '@/lib/checkout'
import { PADDLE_CONFIGURED, openPaddleCheckout } from '@/lib/paddle'

// The buy button, in priority order:
//   1. Paddle overlay checkout, if the Paddle env is set — opens the payment
//      window right on the page, with the buyer's email prefilled so the
//      purchase auto-attaches to their account.
//   2. A plain checkout link, if NEXT_PUBLIC_CHECKOUT_URL is set instead.
//   3. Before either is configured: never force a signed-in user to log in
//      again (the account is token-driven) — send them to the pricing details;
//      only a signed-out visitor goes to login.
export default function BuyButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState<string | undefined>(undefined)

  useEffect(() => {
    let sb
    try {
      sb = supabaseBrowser()
    } catch {
      return // no Supabase env (e.g. a preview): treat as signed out
    }
    sb.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session)
      setEmail(data.session?.user.email ?? undefined)
    })
  }, [])

  if (PADDLE_CONFIGURED) {
    return (
      <button
        type="button"
        className={className}
        onClick={() =>
          openPaddleCheckout({
            email,
            successUrl: typeof window !== 'undefined' ? `${window.location.origin}/account` : undefined,
          }).catch(() => {
            // Paddle.js blocked or offline: fall back to the contact section
            // rather than a silently dead button.
            window.location.assign('/#contact')
          })
        }
      >
        {children}
      </button>
    )
  }

  const href = CHECKOUT_CONFIGURED ? CHECKOUT_URL : signedIn ? '/#pricing' : '/login'
  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}
