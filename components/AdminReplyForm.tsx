'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { replyToThreadAction, type AdminEmailState } from '@/app/admin/actions'

// Reply box for one thread.
//
// Same arm/confirm as the compose box, for the same reason: everything else in
// /admin edits our own records and can be undone, while a sent email is in
// somebody else's inbox with our domain on it and cannot be recalled.
//
// Note what this form does NOT carry: the recipient. Only the thread id goes
// over the wire, and the server resolves the address from it. That is what lets
// the inbox stay masked and still be answerable — the customer's address is
// never in the page source, never in the POST body, and never in anything that
// logs either. It also means a tampered field cannot redirect a reply to
// somebody else under our own domain.

const initial: AdminEmailState = { ok: false, message: '' }

function SendButton({ armed, onArm, to }: { armed: boolean; onArm: (v: boolean) => void; to: string }) {
  const { pending } = useFormStatus()

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => onArm(true)}
        className="rounded-md bg-brass px-3 py-1.5 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
      >
        Reply…
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brass px-3 py-1.5 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Yes, send it'}
      </button>
      <button
        type="button"
        onClick={() => onArm(false)}
        disabled={pending}
        className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg disabled:opacity-60"
      >
        Cancel
      </button>
      <span className="text-xs text-muted">
        Goes to <span className="font-mono text-fg">{to}</span> from{' '}
        <span className="font-mono text-brass">hello@orchestra-automation.com</span>. This can&apos;t be undone.
      </span>
    </div>
  )
}

export default function AdminReplyForm({
  threadId,
  subject,
  to,
}: {
  threadId: string
  subject: string
  // Masked. Shown so the confirm step names somebody, never used to address the
  // message — the server looks that up from the thread.
  to: string
}) {
  const [state, formAction] = useActionState(replyToThreadAction, initial)
  const [armed, setArmed] = useState(false)

  return (
    <form
      action={formAction}
      onSubmit={() => setArmed(false)}
      // The page auto-refreshes every 15s and must not do it while there is
      // unsent text in here — see AdminAutoRefresh.
      data-guard-refresh
      className="mt-4 flex flex-col gap-3"
    >
      <input type="hidden" name="thread" value={threadId} />

      <p className="font-mono text-xs text-faint">
        Subject: <span className="text-muted">{subject}</span>
      </p>

      <textarea
        name="body"
        required
        rows={7}
        placeholder="Write as you would in an email. Plain text — it gets the Orchestra wrapper, and replies come back to this thread."
        onChange={() => setArmed(false)}
        className="w-full resize-y rounded-lg border border-line-strong bg-well px-3 py-2 text-sm text-fg outline-none focus:border-brass"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SendButton armed={armed} onArm={setArmed} to={to} />
        {state.message && (
          <span className={`text-xs ${state.ok ? 'text-ok' : 'text-[#f0a8a2]'}`}>{state.message}</span>
        )}
      </div>
    </form>
  )
}
