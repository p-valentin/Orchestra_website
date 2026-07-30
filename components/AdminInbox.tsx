import {
  adminDataConfigured,
  getMailThread,
  listMailThreads,
  type MailMessageRow,
} from '@/lib/adminData'
import AdminReplyForm from '@/components/AdminReplyForm'
import { markThreadReadAction } from '@/app/admin/actions'

// The support inbox: mail to hello@orchestra-automation.com, threaded, with
// replies that go back out from the same address.
//
// The defaults here are the same timid ones the purchase list uses, for a
// stronger reason — this is customer correspondence, which is at least as
// sensitive as who bought what and can contain anything a person chose to tell
// us:
//
//   - addresses arrive MASKED from the Edge Function and stay masked. Replying
//     does not need them unmasked: the server resolves the recipient from the
//     thread id, so the page never has to render an address to answer one.
//   - the thread LIST carries no message text at all, not even a preview. The
//     function does not return it (see admin-data), so this is a property of
//     the data rather than of this file remembering not to print it.
//   - a body appears only when a thread is opened by name, one at a time.
//   - the whole section is withheld unless TOTP is configured in production —
//     gated by the caller, alongside the compose box.
//
// Message text is rendered as TEXT, never as HTML. The sanitised html is stored
// but deliberately not even sent to this component: an inbound email is
// attacker-controlled markup aimed squarely at the one page holding customer
// data, and the safest thing to do with markup you did not write is not to
// render it.

const card = 'rounded-xl border border-line bg-panel p-4 sm:p-5'

function when(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear()
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// spf=pass dkim=pass — reduced to the verdicts, because the raw header is a
// paragraph and the question it answers is one word long. Shown, never acted
// on: this is the receiving MTA's opinion, offered to the person reading.
function authSummary(raw: string | null): string | null {
  if (!raw) return null
  const found = ['spf', 'dkim', 'dmarc']
    .map((k) => {
      const verdict = raw.match(new RegExp(`\\b${k}=(\\w+)`, 'i'))?.[1]
      return verdict ? `${k}=${verdict.toLowerCase()}` : null
    })
    .filter((v): v is string => v !== null)
  return found.length > 0 ? found.join(' · ') : null
}

function Message({ message }: { message: MailMessageRow }) {
  const inbound = message.direction === 'inbound'
  const auth = inbound ? authSummary(message.auth_results) : null
  return (
    <div
      className={`border-l-2 py-3 pl-3 ${inbound ? 'border-line' : 'border-brass/50'}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-mono text-xs ${inbound ? 'text-muted' : 'text-brass'}`}>
          {inbound ? 'them' : 'us'}
        </span>
        <span className="break-all font-mono text-xs text-faint">{message.from_email}</span>
        <span className="ml-auto font-mono text-[11px] text-faint">{when(message.created_at)}</span>
      </div>

      {/* The From: header a stranger wrote, labelled as such. It is shown only
          when the page has been unmasked, and never treated as identity. */}
      {inbound && message.from_header && (
        <p className="mt-1 break-all font-mono text-[11px] text-faint">
          claims: {message.from_header}
        </p>
      )}
      {auth && <p className="mt-1 font-mono text-[11px] text-faint">{auth}</p>}

      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fg">{message.body_text}</p>

      {message.truncated && (
        <p className="mt-1.5 font-mono text-[11px] text-[#f0a8a2]">
          truncated — the full message is in the forwarded mailbox
        </p>
      )}

      {message.attachments.length > 0 && (
        <p className="mt-2 font-mono text-[11px] text-faint">
          {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}:{' '}
          {message.attachments.map((a) => `${a.name} (${bytes(a.size)})`).join(' · ')} — not stored
          here, open the forwarded mailbox
        </p>
      )}
    </div>
  )
}

export default async function AdminInbox({ openThreadId }: { openThreadId?: string }) {
  if (!adminDataConfigured()) {
    return (
      <div className={card}>
        <p className="text-sm text-muted">
          Not configured. Set ADMIN_DATA_SECRET (32+ characters) on both Vercel and Supabase to
          enable this section.
        </p>
      </div>
    )
  }

  const threads = await listMailThreads(50)

  if (threads === null) {
    return (
      <div className={card}>
        <p className="text-sm text-[#f0a8a2]">
          Couldn&apos;t reach the licensing backend. Check ADMIN_DATA_SECRET matches on both sides.
        </p>
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className={card}>
        <p className="text-sm text-faint">
          Nothing yet. Mail to hello@orchestra-automation.com appears here once the Cloudflare Email
          Worker is deployed and bound to the route — see email-worker/README.md. Until then it still
          arrives in the forwarded mailbox, as it always has.
        </p>
      </div>
    )
  }

  // Unread first, then newest. Deliberately a second sort on top of the
  // function's newest-first ordering rather than a database concern: "what
  // needs answering" is a property of how this page is read, not of the data.
  const ordered = [...threads].sort((a, b) => {
    if ((a.unread_count > 0) !== (b.unread_count > 0)) return a.unread_count > 0 ? -1 : 1
    return b.last_message_at.localeCompare(a.last_message_at)
  })

  const open = openThreadId ? await getMailThread(openThreadId) : null

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className={card}>
        <div className="flex flex-col">
          {ordered.map((t) => {
            const active = open?.thread.id === t.id
            return (
              <a
                key={t.id}
                href={`/admin?tab=email&thread=${t.id}`}
                className={`flex flex-col gap-1 border-t border-line px-2 py-2.5 transition-colors first:border-t-0 ${
                  active ? 'bg-well' : 'hover:bg-well/60'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  {t.unread_count > 0 && (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brass" aria-label="unread" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      t.unread_count > 0 ? 'text-fg' : 'text-muted'
                    }`}
                  >
                    {t.subject}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-faint">
                    {t.participant_email}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-faint">
                    {t.message_count > 1 && `${t.message_count} · `}
                    {when(t.last_message_at)}
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      </div>

      <div className={card}>
        {!open ? (
          <p className="text-sm text-faint">Pick a conversation to read it.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-display text-lg font-medium">{open.thread.subject}</h3>
              <span className="break-all font-mono text-xs text-faint">
                {open.thread.participant_email}
              </span>
              {open.rows.some((m) => m.direction === 'inbound' && m.read_at === null) && (
                <form action={markThreadReadAction} className="ml-auto">
                  <input type="hidden" name="thread" value={open.thread.id} />
                  <button className="font-mono text-xs text-faint hover:text-fg">mark read</button>
                </form>
              )}
            </div>

            <div className="mt-3">
              {open.rows.map((m) => <Message key={m.id} message={m} />)}
            </div>

            <div className="mt-4 border-t border-line pt-2">
              <AdminReplyForm
                threadId={open.thread.id}
                subject={open.thread.reply_subject}
                to={open.thread.participant_email}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
