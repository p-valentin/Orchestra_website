'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitContact } from '@/app/actions'
import { initialContactState } from '@/lib/contact'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brass px-7 py-3.5 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Send message'}
    </button>
  )
}

const fieldBase =
  'w-full rounded-lg border bg-well px-4 py-3 text-fg placeholder:text-faint outline-none transition-colors focus:border-brass'

export default function ContactForm() {
  const [state, formAction] = useActionState(submitContact, initialContactState)

  return (
    <section id="contact" className="mx-auto max-w-2xl px-5 py-20 sm:px-8 lg:py-24">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Get in touch</p>
      <h2 className="mt-4 font-display text-4xl font-medium tracking-tight sm:text-5xl">
        Start a conversation.
      </h2>
      <p className="mt-4 text-muted">
        A question about Orchestra, or something you&apos;re trying to automate with it — drop a note, I read everything.
      </p>

      {state.ok ? (
        <div role="status" className="mt-10 rounded-xl border border-brass/40 bg-brass/10 p-6">
          <p className="font-display text-2xl tracking-tight text-brass-bright">Message sent.</p>
          <p className="mt-1 text-muted">{state.message}</p>
        </div>
      ) : (
        <form action={formAction} className="mt-10 flex flex-col gap-5" noValidate>
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {state.message && !state.ok && (
            <p role="alert" className="rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-4 py-3 text-sm text-[#f0a8a2]">
              {state.message}
            </p>
          )}

          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={80}
              autoComplete="name"
              aria-invalid={Boolean(state.errors.name)}
              className={`${fieldBase} ${state.errors.name ? 'border-[#e06c63]' : 'border-line-strong'}`}
              placeholder="Jane Conductor"
            />
            {state.errors.name && <p className="mt-1.5 text-sm text-[#f0a8a2]">{state.errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              aria-invalid={Boolean(state.errors.email)}
              className={`${fieldBase} ${state.errors.email ? 'border-[#e06c63]' : 'border-line-strong'}`}
              placeholder="you@company.com"
            />
            {state.errors.email && <p className="mt-1.5 text-sm text-[#f0a8a2]">{state.errors.email}</p>}
          </div>

          <div>
            <label htmlFor="message" className="mb-2 block text-sm font-medium">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              maxLength={2000}
              rows={5}
              aria-invalid={Boolean(state.errors.message)}
              className={`${fieldBase} resize-y ${state.errors.message ? 'border-[#e06c63]' : 'border-line-strong'}`}
              placeholder="Tell me what you'd like to automate…"
            />
            {state.errors.message && <p className="mt-1.5 text-sm text-[#f0a8a2]">{state.errors.message}</p>}
          </div>

          <div className="mt-2">
            <SubmitButton />
          </div>
        </form>
      )}
    </section>
  )
}
