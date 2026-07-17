'use client'

import { useState } from 'react'
import { supabaseBrowser, authRedirectTo } from '@/lib/supabaseBrowser'
import { AuthField, AuthButton, AuthError, AuthNote, AuthLink } from '@/components/AuthShell'

// Supabase's own messages are fine for developers, not for buyers. Map the
// ones people actually hit; anything unexpected falls through verbatim so a
// real problem is never swallowed.
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That email already has an account — sign in, or reset your password.'
  }
  if (m.includes('password')) return 'Password needs to be at least 8 characters.'
  if (m.includes('invalid') && m.includes('email')) return "That email doesn't look right — check it and try again."
  if (m.includes('rate') || m.includes('too many')) return 'Too many attempts — wait a minute and try again.'
  return message
}

export default function SignupForm() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [existing, setExisting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setExisting(false)

    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')

    // Mirrors the server's own minimum; checked here so the failure is
    // immediate instead of a round-trip.
    if (password.length < 8) {
      setError('Password needs to be at least 8 characters.')
      setPending(false)
      return
    }

    try {
      const { data, error } = await supabaseBrowser().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectTo('/welcome') },
      })
      if (error) {
        setError(friendlyError(error.message))
      } else if (data.user && (data.user.identities?.length ?? 0) === 0) {
        // Supabase's anti-enumeration signal: with email confirmation on, a
        // sign-up for an address that ALREADY has an account returns no error
        // and an empty identities array (no email is sent). Without this check
        // the form would falsely say "check your inbox" and no mail arrives.
        setExisting(true)
      } else {
        setSentTo(email)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.')
    } finally {
      setPending(false)
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <AuthNote>
          ✓ Check <strong>{sentTo}</strong> and click the confirmation link to activate your account.
        </AuthNote>
        <p className="text-sm text-muted">
          Didn&apos;t get it? Check spam, or <AuthLink href="/signup">try again</AuthLink>. Once
          confirmed, sign in inside Orchestra — any license you bought with this email attaches
          automatically.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthField label="Email" name="email" type="email" autoComplete="email" placeholder="you@email.com" />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="At least 8 characters"
      />
      <AuthButton pending={pending}>{pending ? 'Creating account…' : 'Create account'}</AuthButton>
      {existing ? (
        <p role="alert" className="mt-3 rounded-lg border border-[#f0a8a2]/30 bg-[#f0a8a2]/10 px-4 py-2.5 text-sm text-[#f0a8a2]">
          That email already has an account.{' '}
          <a href="/login" className="font-medium underline underline-offset-2">Log in</a> or{' '}
          <a href="/forgot-password" className="underline underline-offset-2">reset your password</a>.
        </p>
      ) : (
        <AuthError message={error} />
      )}
    </form>
  )
}
