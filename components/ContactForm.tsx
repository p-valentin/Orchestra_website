'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitContact } from '@/app/actions'
import { initialContactState } from '@/lib/contact'
import Eyebrow from './Eyebrow'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal px-7 py-3.5 font-semibold text-[#1a1306] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Send message'}
    </button>
  )
}

const fieldBase =
  'w-full rounded-lg border border-navy/60 bg-[#14100a] px-4 py-3 text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-teal'

export default function ContactForm() {
  const [state, formAction] = useActionState(submitContact, initialContactState)

  return (
    <section id="contact" className="mx-auto max-w-2xl px-5 py-24 sm:px-8 lg:py-28">
      <Eyebrow>Get in touch</Eyebrow>
      <h2 className="mt-5 font-display text-5xl font-semibold tracking-tight text-text-primary sm:text-6xl">
        Start a conversation.
      </h2>
      <p className="mt-4 text-text-secondary">
        Whether it&apos;s a question about the beta or a project you&apos;d like built — drop a note.
      </p>

      {state.ok ? (
        <div
          role="status"
          className="mt-10 rounded-xl border border-teal/40 bg-teal/10 p-6 text-text-primary"
        >
          <p className="font-display text-2xl tracking-wide text-teal">Message sent.</p>
          <p className="mt-1 text-text-secondary">{state.message}</p>
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
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-text-primary">
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
              className={`${fieldBase} ${state.errors.name ? 'border-[#e06c63]' : 'border-subtle'}`}
              placeholder="Jane Conductor"
            />
            {state.errors.name && <p className="mt-1.5 text-sm text-[#f0a8a2]">{state.errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-text-primary">
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
              className={`${fieldBase} ${state.errors.email ? 'border-[#e06c63]' : 'border-subtle'}`}
              placeholder="you@company.com"
            />
            {state.errors.email && <p className="mt-1.5 text-sm text-[#f0a8a2]">{state.errors.email}</p>}
          </div>

          <div>
            <label htmlFor="message" className="mb-2 block text-sm font-medium text-text-primary">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              maxLength={2000}
              rows={5}
              aria-invalid={Boolean(state.errors.message)}
              className={`${fieldBase} resize-y ${state.errors.message ? 'border-[#e06c63]' : 'border-subtle'}`}
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
