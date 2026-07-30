// POST /admin-data — purchases and refund requests for the admin page.
//
// This is the most sensitive read in the system: buyer emails, amounts, order
// references and the free-text reasons customers gave for wanting their money
// back. It is therefore built to be boring and narrow.
//
//   - No query language. The caller picks from a fixed set of views and gets a
//     fixed set of columns. There is nothing to inject and nothing to widen.
//   - Signed, expiring requests (see _shared/admin-auth.ts). No static bearer
//     token exists to leak.
//   - Emails are MASKED unless the caller explicitly asks for them, and asking
//     is recorded in the response so the site can audit it. The admin page
//     renders masked by default, so a screenshot or a shoulder-surfer gets
//     nothing useful.
//   - Hard row caps. A compromised caller cannot vacuum the whole table in one
//     request, and the response stays small enough to render.
//   - Every failure is 404. A prober learns nothing, not even that the
//     function exists.
//
// verify_jwt = false in config.toml because the caller is the website's server,
// which holds no Supabase user session. The signature IS the authentication.

import { serviceClient } from '../_shared/http.ts'
import { verifyAdminRequest } from '../_shared/admin-auth.ts'
import {
  dedupeHash,
  MAX_BODY_TEXT,
  normaliseEmail,
  normaliseSubject,
  replySubject,
  threadTitle,
} from '../_shared/mail.ts'

const MAX_LIMIT = 200

// A thread can hold more than this only if somebody is having a very long
// conversation; the view shows the most recent page of it rather than growing
// without bound.
const MAX_THREAD_MESSAGES = 200

// Whose address our outbound mail comes from. Mirrors _shared/resend.ts.
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? 'hello@orchestra-automation.com'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One literal, so the client's column types are inferred rather than widened
// to "some string" — and so the absence of body_html from this list is a
// visible, reviewable fact rather than a detail buried in a concatenation.
const THREAD_MESSAGE_COLUMNS =
  'id, direction, from_email, from_header, to_email, subject, body_text, truncated, attachments, auth_results, read_at, created_at, sent_email_id'

// A 404 for everything: wrong signature, wrong method, bad body, unknown view.
function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
}

interface AdminRequest {
  view?: unknown
  limit?: unknown
  reveal?: unknown
  id?: unknown
  record?: Record<string, unknown>
}

// Where an outbound message belongs.
//
// A caller-supplied thread_id is a hint, never an instruction: it is checked
// against the recipient before it is honoured. Without that check, a bug in the
// admin page (a stale id from a previous render, a mismatched form field) could
// file what we wrote to one customer into a different customer's conversation
// — and the next person to read that thread would take it as context about
// them. Falling back to find-or-create is always safe; trusting the id is not.
async function resolveOutboundThread(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: { requestedId: string | null; participant: string; subject: string },
): Promise<string | null> {
  if (opts.requestedId && UUID_RE.test(opts.requestedId)) {
    const { data } = await supabase
      .from('mail_threads')
      .select('id')
      .eq('id', opts.requestedId)
      .eq('participant_email', opts.participant)
      .maybeSingle()
    if (data) return data.id as string
  }

  const subjectKey = normaliseSubject(opts.subject)
  const { data: existing } = await supabase
    .from('mail_threads')
    .select('id')
    .eq('participant_email', opts.participant)
    .eq('subject_key', subjectKey)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: created, error } = await supabase
    .from('mail_threads')
    .insert({
      participant_email: opts.participant,
      subject_key: subjectKey,
      subject: threadTitle(opts.subject),
    })
    .select('id')
    .single()
  if (!error) return created.id as string

  // Lost a race with an inbound message arriving at the same moment; the
  // unique index did its job, so take the winner.
  const { data: winner } = await supabase
    .from('mail_threads')
    .select('id')
    .eq('participant_email', opts.participant)
    .eq('subject_key', subjectKey)
    .maybeSingle()
  return winner?.id ?? null
}

// val***98@gmail.com — enough to recognise a buyer you already know, useless
// to anyone who doesn't.
function maskEmail(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 3) return `${local[0]}***${domain}`
  return `${local.slice(0, 3)}***${local.slice(-1)}${domain}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return notFound()

  // Read the body once, as text: the signature covers its exact bytes.
  const rawBody = await req.text()
  const secret = Deno.env.get('ADMIN_DATA_SECRET') ?? ''
  if (!(await verifyAdminRequest(req, rawBody, secret))) return notFound()

  let request: AdminRequest
  try {
    const parsed = JSON.parse(rawBody || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return notFound()
    request = parsed as AdminRequest
  } catch {
    return notFound()
  }

  const limit = Math.min(
    Math.max(typeof request.limit === 'number' && Number.isFinite(request.limit) ? request.limit : 50, 1),
    MAX_LIMIT,
  )
  const reveal = request.reveal === true
  const supabase = serviceClient()

  if (request.view === 'purchases') {
    const { data, error } = await supabase
      .from('licenses')
      .select('id, order_id, buyer_email, user_id, status, plan, purchased_at, claimed_at')
      .order('purchased_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] purchases read failed:', error.message)
      return notFound()
    }
    return Response.json({
      view: 'purchases',
      revealed: reveal,
      rows: (data ?? []).map((r) => ({
        ...r,
        buyer_email: reveal ? r.buyer_email : maskEmail(r.buyer_email),
        // Never ship the raw account uuid to a rendering layer that doesn't
        // need it; "is it attached" is the only question the page asks.
        user_id: undefined,
        attached: r.user_id !== null,
      })),
    })
  }

  if (request.view === 'refunds') {
    const { data, error } = await supabase
      .from('refund_requests')
      .select('id, order_id, reason, detail, status, failure_reason, amount_cents, currency, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] refunds read failed:', error.message)
      return notFound()
    }
    // Buyer emails are not selected at all here: a refund row is identified by
    // its order reference, and the purchases view already carries the address.
    return Response.json({ view: 'refunds', revealed: reveal, rows: data ?? [] })
  }

  // The only write this endpoint accepts. The website has no service-role key
  // — deliberately — so the compose box cannot insert its own audit row and has
  // to ask for it here, under the same HMAC as every read.
  //
  // Narrow on purpose: it appends one row to the send log, and — when the send
  // succeeded and carried a body — files that message into its conversation.
  // Status is constrained to the two the table allows, and the strings are
  // truncated, so a bug in the caller cannot turn this into unbounded storage.
  // Nothing here can modify a licence, a refund or an account.
  //
  // The two writes are ordered, not atomic, and deliberately so: the SEND LOG
  // row is what must exist, because it is the answer to "did that go out". If
  // the conversation write fails afterwards the log is still correct and the
  // reply is still sent; the reverse — a thread showing a message with no
  // record of its delivery — would be the misleading one.
  if (request.view === 'record-email') {
    const rec = request.record
    if (!rec || typeof rec !== 'object') return notFound()
    const status = rec.status === 'failed' ? 'failed' : 'sent'
    const str = (v: unknown, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
    const toEmail = str(rec.to_email, 254)
    const subject = str(rec.subject, 200)
    if (!toEmail || !subject) return notFound()

    const { data: logged, error } = await supabase
      .from('sent_emails')
      .insert({
        to_email: toEmail,
        subject,
        status,
        provider_id: str(rec.provider_id, 128),
        error: str(rec.error, 500),
        source: str(rec.source, 40) ?? 'admin-form',
      })
      .select('id')
      .single()
    if (error) {
      console.error('[admin-data] email record failed:', error.message)
      return notFound()
    }

    // A failed send is logged and filed nowhere: it never reached the
    // customer, so it is not part of the conversation. A body-less record
    // (a campaign, a backfill) is likewise log-only.
    const body = typeof rec.body === 'string' ? rec.body.slice(0, MAX_BODY_TEXT) : ''
    const participant = normaliseEmail(toEmail)
    if (status !== 'sent' || !body || !participant) {
      return Response.json({ view: 'record-email', ok: true, filed: false })
    }

    const threadId = await resolveOutboundThread(supabase, {
      requestedId: typeof rec.thread_id === 'string' ? rec.thread_id : null,
      participant,
      subject,
    })
    if (!threadId) {
      console.error('[admin-data] could not resolve a thread for an outbound message')
      return Response.json({ view: 'record-email', ok: true, filed: false })
    }

    const { error: fileError } = await supabase.from('mail_messages').insert({
      thread_id: threadId,
      direction: 'outbound',
      // Keyed on the send-log row rather than on the content: sending the same
      // "any update?" to the same person twice is two messages, not a replay.
      dedupe_hash: await dedupeHash({ messageId: `sent:${logged.id}`, from: '', to: '', subject: '', body: '' }),
      from_email: SUPPORT_EMAIL,
      to_email: participant,
      subject,
      body_text: body,
      sent_email_id: logged.id,
    })
    if (fileError) {
      console.error('[admin-data] outbound file failed:', fileError.message)
      return Response.json({ view: 'record-email', ok: true, filed: false })
    }

    await supabase
      .from('mail_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId)

    return Response.json({ view: 'record-email', ok: true, filed: true, thread_id: threadId })
  }

  // The unread badge on the Email tab. Deliberately its own view returning a
  // single integer: the tab label is rendered on EVERY admin page load, and
  // there is no reason for "are there unread messages" to drag customer
  // addresses or message bodies across the wire to answer it.
  if (request.view === 'mail-unread') {
    const { count, error } = await supabase
      .from('mail_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .is('read_at', null)
    if (error) {
      console.error('[admin-data] unread count failed:', error.message)
      return notFound()
    }
    return Response.json({ view: 'mail-unread', unread: count ?? 0 })
  }

  // The thread LIST. Carries no message text at all — not even a preview.
  //
  // That is the same rule the send log follows and the reason it is enforced
  // here rather than in the UI: a list is a surface that gets read casually and
  // screenshotted, and a snippet would put customer correspondence back onto it
  // through the side door. Bodies require opening one named thread.
  if (request.view === 'threads') {
    const { data: threads, error } = await supabase
      .from('mail_threads')
      .select('id, participant_email, subject, last_message_at, created_at')
      .order('last_message_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] threads read failed:', error.message)
      return notFound()
    }

    const ids = (threads ?? []).map((t) => t.id as string)
    // Counted in one pass over three columns rather than an aggregate per
    // thread — and note the select list: direction and read_at, never a body.
    const stats = new Map<string, { messages: number; unread: number; lastDirection: string }>()
    if (ids.length > 0) {
      const { data: rows } = await supabase
        .from('mail_messages')
        .select('thread_id, direction, read_at, created_at')
        .in('thread_id', ids)
        .order('created_at', { ascending: true })
        .limit(5000)
      for (const row of rows ?? []) {
        const key = row.thread_id as string
        const stat = stats.get(key) ?? { messages: 0, unread: 0, lastDirection: 'inbound' }
        stat.messages += 1
        if (row.direction === 'inbound' && row.read_at === null) stat.unread += 1
        stat.lastDirection = row.direction as string
        stats.set(key, stat)
      }
    }

    return Response.json({
      view: 'threads',
      revealed: reveal,
      rows: (threads ?? []).map((t) => {
        const stat = stats.get(t.id as string)
        return {
          id: t.id,
          participant_email: reveal ? t.participant_email : maskEmail(t.participant_email as string),
          subject: t.subject,
          last_message_at: t.last_message_at,
          created_at: t.created_at,
          message_count: stat?.messages ?? 0,
          unread_count: stat?.unread ?? 0,
          last_direction: stat?.lastDirection ?? 'inbound',
        }
      }),
    })
  }

  // One thread, in order. This is the only place a message body is ever
  // returned, and it takes a specific id — there is no "give me every body"
  // shape available to a caller, compromised or otherwise.
  if (request.view === 'thread') {
    const id = typeof request.id === 'string' && UUID_RE.test(request.id) ? request.id : null
    if (!id) return notFound()

    const { data: thread, error: threadError } = await supabase
      .from('mail_threads')
      .select('id, participant_email, subject, last_message_at, created_at')
      .eq('id', id)
      .maybeSingle()
    if (threadError) {
      console.error('[admin-data] thread read failed:', threadError.message)
      return notFound()
    }
    if (!thread) return notFound()

    const { data: messages, error: messageError } = await supabase
      .from('mail_messages')
      .select(THREAD_MESSAGE_COLUMNS)
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
      .limit(MAX_THREAD_MESSAGES)
    if (messageError) {
      console.error('[admin-data] thread messages read failed:', messageError.message)
      return notFound()
    }

    // body_html is stored but deliberately NOT returned. The admin page renders
    // text; shipping sanitised-but-attacker-shaped markup to a React tree that
    // has no use for it is how it ends up in a dangerouslySetInnerHTML one day.
    return Response.json({
      view: 'thread',
      revealed: reveal,
      thread: {
        ...thread,
        participant_email: reveal ? thread.participant_email : maskEmail(thread.participant_email as string),
        // Computed here rather than on the website so subject normalisation
        // has one implementation. The website would otherwise need its own
        // copy of the Re:/AW:/Fwd: rules, and the day the two disagreed a
        // reply would start a second thread instead of joining this one.
        reply_subject: replySubject(thread.subject as string),
      },
      rows: (messages ?? []).map((m) => ({
        ...m,
        from_email: reveal ? m.from_email : maskEmail(m.from_email as string),
        to_email: reveal ? m.to_email : maskEmail(m.to_email as string),
        // The From: header is free text that frequently CONTAINS an address,
        // so masking the address column while shipping this raw would undo the
        // masking entirely. Withheld unless the caller asked to unmask.
        from_header: reveal ? m.from_header : null,
      })),
    })
  }

  // Mark every inbound message in one thread as read. Idempotent, and it can
  // express nothing else — no unread-ing, no cross-thread update.
  if (request.view === 'thread-read') {
    const id = typeof request.id === 'string' && UUID_RE.test(request.id) ? request.id : null
    if (!id) return notFound()
    const { error } = await supabase
      .from('mail_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', id)
      .eq('direction', 'inbound')
      .is('read_at', null)
    if (error) {
      console.error('[admin-data] mark read failed:', error.message)
      return notFound()
    }
    return Response.json({ view: 'thread-read', ok: true })
  }

  if (request.view === 'emails') {
    const { data, error } = await supabase
      .from('sent_emails')
      .select('id, to_email, subject, status, provider_id, error, source, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] emails read failed:', error.message)
      return notFound()
    }
    // Masked by default like purchases. A log of who we have written to is a
    // list of customer addresses; the page should stay safe to screenshot
    // without thinking about it, and revealing stays a deliberate act.
    return Response.json({
      view: 'emails',
      revealed: reveal,
      rows: (data ?? []).map((r) => ({
        ...r,
        to_email: reveal ? r.to_email : maskEmail(r.to_email),
      })),
    })
  }

  return notFound()
})
