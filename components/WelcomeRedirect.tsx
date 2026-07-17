'use client'

import { useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

// The confirmation link lands here with the new session in the URL fragment.
// Instantiating the browser client parses and stores it (detectSessionInUrl),
// which both signs this tab in AND — because the session is written to shared
// storage — lets the original signup tab pick it up and sign in too. Once the
// session is live we send this tab on to the account page.
export default function WelcomeRedirect() {
  useEffect(() => {
    const sb = supabaseBrowser()
    let done = false
    const go = (session: unknown) => {
      if (done) return
      done = true
      window.location.replace(session ? '/account' : '/login')
    }
    sb.auth.getSession().then(({ data }) => {
      if (data.session) go(data.session)
    })
    // detectSessionInUrl resolves asynchronously; catch it via the auth event too.
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) go(session)
    })
    // Fallback: if there's no session shortly after landing, the link was stale
    // or already used — send them to sign in rather than spin forever.
    const timeout = setTimeout(() => go(null), 4000)
    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])
  return null
}
