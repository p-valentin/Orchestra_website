'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { AuthNote, AuthError, AuthLink } from '@/components/AuthShell'

// The confirmation link lands here with either a fresh session or an error in
// the URL fragment. Instantiating the browser client parses a session
// (detectSessionInUrl), which both signs this tab in AND — because the session
// is written to shared storage — lets the original signup tab pick it up too.
// Expired or reused links arrive as #error_code=otp_expired instead; those
// must show the truth, not "confirmed ✓" followed by a silent bounce.
export default function WelcomeRedirect() {
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    // Read the fragment before supabase-js clears it.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const errorCode = hash.get('error_code') ?? (hash.get('error') ? 'unknown' : null)
    if (errorCode) {
      setFailed(errorCode)
      return
    }

    const sb = supabaseBrowser()
    let done = false
    const go = () => {
      if (done) return
      done = true
      window.location.replace('/account')
    }
    sb.auth.getSession().then(({ data }) => {
      if (data.session) go()
    })
    // detectSessionInUrl resolves asynchronously; catch it via the auth event too.
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) go()
    })
    // No session shortly after landing: the link was stale or already used.
    const timeout = setTimeout(() => setFailed('timeout'), 4000)
    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  if (failed) {
    return (
      <div className="space-y-4">
        <AuthError
          message={
            failed === 'otp_expired' || failed === 'timeout'
              ? 'This confirmation link has expired or was already used.'
              : 'This confirmation link didn’t work.'
          }
        />
        <p className="text-sm text-muted">
          Already confirmed? <AuthLink href="/login">Log in</AuthLink>. Otherwise{' '}
          <AuthLink href="/signup">sign up again</AuthLink> to get a fresh link.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AuthNote>✓ Your account is confirmed. Signing you in…</AuthNote>
      <p className="text-sm text-muted">
        Taking you to your account. If you bought a license with this email it&apos;s already
        attached; otherwise your 14-day trial starts the first time you sign in inside Orchestra.
      </p>
    </div>
  )
}
