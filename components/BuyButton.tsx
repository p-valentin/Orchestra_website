'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { CHECKOUT_URL, CHECKOUT_CONFIGURED } from '@/lib/checkout'

// A buy button that respects the session. Once NEXT_PUBLIC_CHECKOUT_URL is set
// it always goes to the Paddle checkout. Before then it must never force a
// signed-in user to log in again (the account is token-driven): a logged-in
// visitor is sent to the pricing details, and only a signed-out one goes to
// login — the default auth view, with "create account" a click away.
export default function BuyButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    let sb
    try {
      sb = supabaseBrowser()
    } catch {
      return // no Supabase env (e.g. a preview): treat as signed out
    }
    sb.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
  }, [])

  const href = CHECKOUT_CONFIGURED ? CHECKOUT_URL : signedIn ? '/#pricing' : '/login'

  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}
