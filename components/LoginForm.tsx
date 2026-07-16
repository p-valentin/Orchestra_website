'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { AuthField, AuthButton, AuthError } from '@/components/AuthShell'

function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Wrong email or password.'
  if (m.includes('email not confirmed')) {
    return 'Your email isn’t confirmed yet — click the link in the confirmation email first.'
  }
  if (m.includes('rate') || m.includes('too many')) return 'Too many attempts — wait a minute and try again.'
  return message
}

export default function LoginForm() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')

    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password })
      if (error) {
        setError(friendlyError(error.message))
        setPending(false)
        return
      }
      // Full navigation (not router.push) so the nav re-reads the session.
      window.location.assign('/account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthField label="Email" name="email" type="email" autoComplete="email" placeholder="you@email.com" />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
      />
      <AuthButton pending={pending}>{pending ? 'Signing in…' : 'Sign in'}</AuthButton>
      <AuthError message={error} />
    </form>
  )
}
