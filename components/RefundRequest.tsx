'use client'

import { useEffect, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

// Self-serve refund, offered for 14 days after purchase.
//
// The window shown here is a COURTESY, not the control: /refund-request
// recomputes eligibility from the stored purchase date and the licence's real
// status before it moves any money. Hiding the button early or showing it late
// is a cosmetic bug, never a security one.
//
// Asking why is the point of the flow — it is the only moment a departing
// customer will reliably tell you what went wrong — so the reason is required
// and the free-text box is offered but optional.

export const REFUND_WINDOW_DAYS = 14

const REASONS: { value: string; label: string }[] = [
  { value: 'not_what_expected', label: 'It wasn’t what I expected' },
  { value: 'missing_feature', label: 'It’s missing something I need' },
  { value: 'too_difficult', label: 'Too difficult to use' },
  { value: 'bugs', label: 'Bugs, or it didn’t work' },
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'bought_by_mistake', label: 'I bought it by mistake' },
  { value: 'other', label: 'Something else' },
]

const ERRORS: Record<string, string> = {
  window_closed: 'The 14-day refund window has closed. Email us and we’ll still take a look.',
  already_requested: 'A refund is already in progress for this licence.',
  no_refundable_license: 'There’s no active licence on this account to refund.',
  not_self_refundable: 'This licence needs a human — email us and we’ll sort it out.',
  refund_not_possible: 'This order can’t be refunded automatically. Email us and we’ll handle it.',
  refunds_unavailable: 'Refunds are briefly unavailable. Try again shortly, or email us.',
}

export function daysLeft(purchasedAt: string, now: number = Date.now()): number {
  const purchased = Date.parse(purchasedAt)
  if (!Number.isFinite(purchased)) return 0
  const elapsedDays = (now - purchased) / 86_400_000
  return Math.max(0, Math.ceil(REFUND_WINDOW_DAYS - elapsedDays))
}

export default function RefundRequest({
  purchasedAt,
  existingRequest,
  onRefunded,
}: {
  purchasedAt: string
  // A refund already issued (or still settling) for this licence. Non-null
  // means the button is gone for good — there is nothing left to refund.
  existingRequest: { status: string } | null
  onRefunded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const left = daysLeft(purchasedAt)

  // Focus into the dialog on open and back to the trigger on close, and let
  // Escape dismiss it — the same treatment the remove-device dialog gets.
  useEffect(() => {
    if (!open) return
    const first = dialogRef.current?.querySelector<HTMLElement>('select, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy])

  // Already refunded. The licence can still read `active` for a few seconds
  // while the provider's webhook is in flight, so this — not the licence
  // status — is what retires the button. Without it a reload inside that
  // window would offer a second refund and then refuse it with an error the
  // buyer did nothing to cause.
  if (existingRequest) {
    return (
      <p className="mt-3 text-sm text-muted">
        {existingRequest.status === 'refunded'
          ? 'Refunded. Your licence is being deactivated and the money is on its way back to your original payment method — banks usually take 5–10 business days.'
          : 'A refund is being processed for this licence.'}
      </p>
    )
  }

  if (left <= 0) return null

  async function submit() {
    if (busy || !reason) return
    setBusy(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabaseBrowser().functions.invoke('refund-request', {
        body: { reason, detail: detail.trim() || undefined },
      })
      if (fnError) {
        // supabase-js wraps non-2xx in FunctionsHttpError; dig out our code so
        // the buyer sees something actionable rather than "Edge Function
        // returned a non-2xx status code".
        let code = ''
        try {
          const ctx = (fnError as { context?: Response }).context
          if (ctx) code = (await ctx.clone().json())?.error ?? ''
        } catch {
          /* fall through to the generic message */
        }
        setError(ERRORS[code] ?? 'We couldn’t process that just now. Try again, or email us.')
        return
      }
      if (data?.ok) {
        setOpen(false)
        onRefunded()
      } else {
        setError('We couldn’t process that just now. Try again, or email us.')
      }
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-faint underline-offset-4 transition-colors hover:text-muted hover:underline"
      >
        Request a refund
        <span className="ml-1.5 font-mono text-xs">
          ({left} {left === 1 ? 'day' : 'days'} left)
        </span>
      </button>
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-title"
      className="mt-4 rounded-lg border border-line-strong bg-well p-4"
    >
      <h3 id="refund-title" className="font-display text-base font-medium">
        Refund your licence
      </h3>
      {/* Deliberately no figure here. The old copy hardcoded "$149" — which
          rendered as "$ $149" thanks to a stray JSX interpolation, and would
          have been wrong for anyone charged a different amount (tax, another
          currency, a discount). The receipt already states what they paid. */}
      <p className="mt-1.5 text-sm text-muted">
        We’ll refund your purchase in full, including any tax, to your original payment
        method. Your licence stops working, but the flows you built stay on your machine.
      </p>

      <label className="mt-4 block text-sm text-muted" htmlFor="refund-reason">
        What pushed you to ask? <span className="text-faint">(required)</span>
      </label>
      <select
        id="refund-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="mt-1.5 w-full rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-fg"
      >
        <option value="">Choose one…</option>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-sm text-muted" htmlFor="refund-detail">
        Anything else? <span className="text-faint">(optional, but it genuinely helps)</span>
      </label>
      <textarea
        id="refund-detail"
        value={detail}
        onChange={(e) => setDetail(e.target.value.slice(0, 2000))}
        disabled={busy}
        rows={3}
        className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-fg"
        placeholder="What would have had to be different?"
      />

      {error && <p className="mt-3 text-sm text-[#f0a8a2]">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={submit}
          disabled={busy || !reason}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Refunding…' : 'Refund my licence'}
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setError(null)
            triggerRef.current?.focus()
          }}
          disabled={busy}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          Keep my licence
        </button>
      </div>
    </div>
  )
}
