'use client'

import { useState } from 'react'
import { supabaseBrowser, authRedirectTo } from '@/lib/supabaseBrowser'
import { AuthField, AuthButton, AuthError, AuthNote } from '@/components/AuthShell'

export default function ForgotPasswordForm() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim().toLowerCase()
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectTo('/reset-password'),
      })
      // Deliberately not surfacing "no such user": that would turn this form
      // into an account-existence oracle. Rate limiting is the one case worth
      // reporting, since the mail genuinely didn't go out.
      if (error && /rate|too many/i.test(error.message)) {
        setError('Too many attempts — wait a minute and try again.')
      } else {
        setSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.')
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <AuthNote>
        ✓ If that email has an Orchestra account, a reset link is on its way. The link opens here and
        expires shortly.
      </AuthNote>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthField label="Email" name="email" type="email" autoComplete="email" placeholder="you@email.com" />
      <AuthButton pending={pending}>{pending ? 'Sending…' : 'Send reset link'}</AuthButton>
      <AuthError message={error} />
    </form>
  )
}
