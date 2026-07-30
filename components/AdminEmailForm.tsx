'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendAdminEmailAction, type AdminEmailState } from '@/app/admin/actions'

// Compose-and-send from hello@orchestra-automation.com.
//
// The confirm step is the point of this component. Every other admin control
// edits our own records and can be undone; a sent email is in someone else's
// inbox with our domain on it and cannot be recalled. So the button asks once,
// showing the recipient, before anything leaves.

const initial: AdminEmailState = { ok: false, message: '' }

function SendButton({ armed, onArm }: { armed: boolean; onArm: (v: boolean) => void }) {
  const { pending } = useFormStatus()

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => onArm(true)}
        className="rounded-md bg-brass px-3 py-1.5 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
      >
        Send…
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
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
    </div>
  )
}

export default function AdminEmailForm() {
  const [state, formAction] = useActionState(sendAdminEmailAction, initial)
  const [armed, setArmed] = useState(false)
  const [to, setTo] = useState('')

  const input =
    'rounded-lg border border-line-strong bg-well px-3 py-2 text-sm text-fg outline-none focus:border-brass'

  return (
    <form
      action={formAction}
      onSubmit={() => setArmed(false)}
      // The page auto-refreshes every 15s and must not do it while there is
      // unsent text in here — see AdminAutoRefresh.
      data-guard-refresh
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-2">
        <input
          name="to"
          type="email"
          required
          placeholder="them@example.com"
          value={to}
          onChange={(e) => {
            setTo(e.target.value)
            setArmed(false)
          }}
          className={`${input} w-full sm:w-72`}
        />
        <input
          name="subject"
          required
          placeholder="Subject"
          onChange={() => setArmed(false)}
          className={`${input} w-full flex-1`}
        />
      </div>

      <textarea
        name="body"
        required
        rows={7}
        placeholder="Write as you would in an email. Plain text — it gets the Orchestra wrapper and a reply-to that reaches you."
        onChange={() => setArmed(false)}
        className={`${input} w-full resize-y`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SendButton armed={armed} onArm={setArmed} />
        {armed && (
          <span className="text-xs text-muted">
            Sends from <span className="font-mono text-brass">hello@orchestra-automation.com</span>
            {to ? (
              <>
                {' '}to <span className="font-mono text-fg">{to}</span>
              </>
            ) : null}
            . This can&apos;t be undone.
          </span>
        )}
        {state.message && (
          <span className={`text-xs ${state.ok ? 'text-ok' : 'text-[#f0a8a2]'}`}>{state.message}</span>
        )}
      </div>
    </form>
  )
}
