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
    return 'That email already has an account — sign in inside Orchestra, or reset your password.'
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

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
      const { error } = await supabaseBrowser().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectTo('/welcome') },
      })
      if (error) setError(friendlyError(error.message))
      else setSentTo(email)
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
      <AuthError message={error} />
    </form>
  )
}
