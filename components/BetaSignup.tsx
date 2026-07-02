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
      className="shrink-0 rounded-lg border border-brass/50 px-5 py-3 font-medium text-brass-bright transition-colors hover:bg-brass hover:text-[#1a1306] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Claiming…' : 'Claim free license'}
    </button>
  )
}

export default function BetaSignup({ remaining, closed }: { remaining: number; closed?: boolean }) {
  const [state, formAction] = useActionState(claimBeta, initialBetaState)

  if (state.ok) {
    return (
      <p role="status" className="mt-6 rounded-lg border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
        ✓ {state.message}
      </p>
    )
  }

  if (closed ?? remaining <= 0) {
    return (
      <p className="mt-6 rounded-lg border border-line-strong bg-well px-4 py-3 text-sm text-faint">
        License claims are now closed — thanks for the interest!
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-8 max-w-md" noValidate>
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
          className="w-full rounded-lg border border-line-strong bg-well px-4 py-3 text-fg placeholder:text-faint outline-none transition-colors focus:border-brass"
        />
        <SubmitButton />
      </div>
      {state.error && <p role="alert" className="mt-2 text-sm text-[#f0a8a2]">{state.error}</p>}
    </form>
  )
}
