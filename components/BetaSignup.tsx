'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { claimBeta } from '@/app/actions'
import { initialBetaState } from '@/lib/beta'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-teal px-5 py-3 font-semibold text-[#1a1306] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Claiming…' : 'Claim it now'}
    </button>
  )
}

export default function BetaSignup() {
  const [state, formAction] = useActionState(claimBeta, initialBetaState)

  if (state.ok) {
    return (
      <p
        role="status"
        className="mt-6 rounded-lg border border-teal/40 bg-teal/10 px-4 py-3 text-sm text-text-primary"
      >
        ✓ {state.message}
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-6" noValidate>
      <p className="mb-2.5 text-sm text-text-secondary">
        Free during the beta — claim your license now and it stays free for you, forever.
      </p>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="beta-company">Company</label>
        <input id="beta-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@email.com"
          className="w-full rounded-lg border border-navy/60 bg-[#14100a] px-4 py-3 text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-teal"
        />
        <SubmitButton />
      </div>
      {state.error && <p role="alert" className="mt-2 text-sm text-[#f0a8a2]">{state.error}</p>}
    </form>
  )
}
