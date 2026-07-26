'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitWaitlist } from '@/app/actions'
import { initialWaitlistState } from '@/lib/contact'

// Stands in for the Buy button until checkout is live. A priced button that
// can't take money reads as a broken store; an email box is an honest "not
// yet" that still catches the intent.

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brass px-6 py-3 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Adding you…' : 'Email me when licenses go on sale'}
    </button>
  )
}

export default function WaitlistForm() {
  const [state, formAction] = useActionState(submitWaitlist, initialWaitlistState)

  if (state.ok) {
    return (
      <div role="status" className="mt-8 rounded-lg border border-brass/40 bg-brass/10 p-5">
        <p className="font-display text-xl tracking-tight text-brass-bright">You&rsquo;re on the list.</p>
        <p className="mt-1 text-sm text-muted">One email when licenses go on sale — nothing else.</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-3" noValidate>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="waitlist-company">Company</label>
        <input id="waitlist-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-4 py-3 text-sm text-[#f0a8a2]">
          {state.message}
        </p>
      )}

      <label htmlFor="waitlist-email" className="sr-only">
        Email address
      </label>
      <input
        id="waitlist-email"
        name="email"
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        aria-invalid={Boolean(state.errors.email)}
        placeholder="you@company.com"
        className={`w-full rounded-lg border bg-well px-4 py-3 text-fg placeholder:text-faint outline-none transition-colors focus:border-brass ${
          state.errors.email ? 'border-[#e06c63]' : 'border-line-strong'
        }`}
      />
      {state.errors.email && <p className="text-sm text-[#f0a8a2]">{state.errors.email}</p>}

      <SubmitButton />

      <p className="text-xs leading-relaxed text-faint">
        Licenses go on sale shortly. Leave your email and I&rsquo;ll send one message when they do —
        nothing else.
      </p>
    </form>
  )
}
