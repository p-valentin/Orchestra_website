'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { AuthField, AuthButton, AuthError, AuthNote, AuthLink } from '@/components/AuthShell'

type Stage = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordForm() {
  const [stage, setStage] = useState<Stage>('checking')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Supabase puts a recovery session in the URL fragment. supabase-js parses
  // it asynchronously, so wait for the PASSWORD_RECOVERY event (or an already
  // -established session) rather than reading the hash by hand.
  useEffect(() => {
    const client = supabaseBrowser()
    let settled = false

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        settled = true
        setStage('ready')
      }
    })

    client.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true
        setStage('ready')
      }
    })

    // A link that's expired, already used, or hand-typed leaves no session.
    const timer = setTimeout(() => {
      if (!settled) setStage('invalid')
    }, 2500)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const password = String(new FormData(e.currentTarget).get('password') ?? '')
    if (password.length < 8) {
      setError('Password needs to be at least 8 characters.')
      setPending(false)
      return
    }

    try {
      const client = supabaseBrowser()
      const { error } = await client.auth.updateUser({ password })
      if (error) {
        const m = error.message.toLowerCase()
        if (/same|different/.test(m)) setError('That is already your password — pick a new one.')
        else if (m.includes('password') && (m.includes('at least') || m.includes('short'))) {
          setError('Password needs to be at least 8 characters.')
        } else if (m.includes('password')) {
          setError('That password is too easy to guess — pick a different one.')
        } else {
          setError('Couldn’t save the new password — request a fresh reset link and try again.')
        }
      } else {
        // The recovery session did its job; don't leave it lying around.
        await client.auth.signOut()
        setStage('done')
      }
    } catch (err) {
      // Never surface raw internals (config errors name env vars).
      console.error(err)
      setError('Something went wrong — try again.')
    } finally {
      setPending(false)
    }
  }

  if (stage === 'checking') return <p className="text-sm text-muted">Checking your link…</p>

  if (stage === 'invalid') {
    return (
      <div className="space-y-4">
        <AuthError message="This reset link is invalid or has expired." />
        <p className="text-sm text-muted">
          Reset links are single-use and short-lived.{' '}
          <AuthLink href="/forgot-password">Request a new one</AuthLink>.
        </p>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="space-y-4">
        <AuthNote>✓ Password changed.</AuthNote>
        <p className="text-sm text-muted">Open Orchestra and sign in with your new password.</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="At least 8 characters"
      />
      <AuthButton pending={pending}>{pending ? 'Saving…' : 'Set new password'}</AuthButton>
      <AuthError message={error} />
    </form>
  )
}
