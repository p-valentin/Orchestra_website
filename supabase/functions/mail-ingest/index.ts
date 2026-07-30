// POST /mail-ingest — one inbound email, from the Cloudflare Email Worker.
//
// This is the only endpoint in the system whose entire payload was composed by
// a stranger, and the only write endpoint that is reachable without a Supabase
// JWT. Both facts shape it:
//
//   - Authentication is the same signed, expiring HMAC as admin-data
//     (_shared/admin-auth.ts), but keyed on MAIL_INGEST_SECRET rather than
//     ADMIN_DATA_SECRET. The Worker runs on Cloudflare's infrastructure with
//     its own secret store and its own deploy credentials; it is a different
//     trust domain from the website, so it gets a different key. A compromise
//     of one does not become a compromise of the other, and the two can be
//     rotated independently.
//   - Every failure is a 404, exactly like admin-data. A prober should not
//     learn that a mail ingest exists, because knowing it exists is the first
//     step to filling an admin's inbox with forged conversations.
//   - It is a WRITE, so unlike admin-data it cannot shrug at replay. The
//     defence is idempotency in the schema: mail_messages.dedupe_hash is
//     unique, so the same delivery twice — a Cloudflare retry, a
//     double-bound route, or a captured request replayed inside the freshness
//     window — collides and returns the same success it returned the first
//     time. Nothing about that path depends on this file remembering anything.
//   - Nothing in the payload is trusted. Addresses are re-derived, subjects
//     normalised, HTML rebuilt from an allowlist, every string capped, and
//     attachments reduced to names and sizes. See _shared/mail.ts.
//
// verify_jwt = false in config.toml: Cloudflare holds no Supabase session. The
// signature IS the authentication.

import { serviceClient } from '../_shared/http.ts'
import { verifyAdminRequest } from '../_shared/admin-auth.ts'
import { normaliseInbound, threadTitle } from '../_shared/mail.ts'

// Generous next to the body caps in _shared/mail.ts (64 KiB text + 192 KiB
// html), tight enough that nobody can make this function buffer a mailbox.
// Mail over this size still reaches the forwarded inbox — the Worker forwards
// before it posts — so the cap costs visibility in /admin, never the message.
const MAX_REQUEST_BYTES = 1024 * 1024

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
}

// Past the cap the body is still read to completion, but discarded rather than
// buffered.
//
// Refusing early is the obvious move and it is wrong in both its forms.
// Cancelling the stream hangs up on a caller that is still uploading, and the
// request then sits there until the gateway times it out — an oversized POST
// becomes a held connection and a 504 two and a half minutes later, which is a
// better denial of service than the attacker deserves. Trusting Content-Length
// to reject before reading has the same problem the moment it is a lie.
//
// So there is one path: read everything, keep only what fits. Draining costs
// bandwidth that was arriving anyway and lets the 404 go out immediately.
const MAX_DRAIN_BYTES = 8 * 1024 * 1024

async function readCappedText(req: Request, max: number): Promise<string | null> {
  const reader = req.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let total = 0
  let over = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      // Stop buffering, keep reading. Nothing already read is kept either:
      // a truncated JSON document is not a message.
      over = true
      chunks.length = 0
      if (total > MAX_DRAIN_BYTES) {
        // Beyond even the drain budget this is not a mail delivery. Hang up
        // and accept the ugly close; there is no polite reading of 8 MB.
        await reader.cancel().catch(() => {})
        return null
      }
      continue
    }
    chunks.push(value)
  }
  if (over) return null

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return notFound()

  const rawBody = await readCappedText(req, MAX_REQUEST_BYTES)
  if (rawBody === null) return notFound()

  const secret = Deno.env.get('MAIL_INGEST_SECRET') ?? ''
  if (!(await verifyAdminRequest(req, rawBody, secret))) return notFound()

  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(rawBody || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return notFound()
    payload = parsed as Record<string, unknown>
  } catch {
    return notFound()
  }

  // Malformed MIME reaches here as a payload with no usable sender or no body
  // at all. Dropped rather than stored: a row with nobody attached to it is
  // noise in the one place that has to stay readable, and the mail itself is
  // already in the forwarded mailbox.
  const message = await normaliseInbound(payload)
  if (!message) return Response.json({ ok: true, stored: false, reason: 'unusable' })

  const supabase = serviceClient()

  // 1. Follow the reference chain, so a conversation survives someone renaming
  //    the subject halfway through.
  //
  //    Constrained to threads with the SAME participant, which is the whole
  //    security of this step: In-Reply-To is attacker-controlled, so without
  //    that constraint anyone who learned a Message-ID could drop their own
  //    text into another customer's thread and have an admin read it as
  //    context for that customer.
  let threadId: string | null = null
  const chain = [message.in_reply_to, ...message.reference_ids].filter((v): v is string => Boolean(v))
  if (chain.length > 0) {
    const { data: referenced } = await supabase
      .from('mail_messages')
      .select('thread_id')
      .in('message_id', chain)
      .limit(20)
    const candidateThreads = [...new Set((referenced ?? []).map((r) => r.thread_id as string))]
    if (candidateThreads.length > 0) {
      const { data: owned } = await supabase
        .from('mail_threads')
        .select('id')
        .in('id', candidateThreads)
        .eq('participant_email', message.from_email)
        .limit(1)
      threadId = owned?.[0]?.id ?? null
    }
  }

  // 2. Otherwise find or create the thread for (participant, normalised
  //    subject).
  if (!threadId) {
    const { data: existing } = await supabase
      .from('mail_threads')
      .select('id')
      .eq('participant_email', message.from_email)
      .eq('subject_key', message.subject_key)
      .maybeSingle()

    if (existing) {
      threadId = existing.id as string
    } else {
      const { data: created, error } = await supabase
        .from('mail_threads')
        .insert({
          participant_email: message.from_email,
          subject_key: message.subject_key,
          subject: threadTitle(message.subject),
        })
        .select('id')
        .single()
      if (error) {
        // 23505 means two deliveries raced and the other one won; the unique
        // index is doing its job, so take the winner rather than failing.
        const { data: winner } = await supabase
          .from('mail_threads')
          .select('id')
          .eq('participant_email', message.from_email)
          .eq('subject_key', message.subject_key)
          .maybeSingle()
        if (!winner) {
          console.error('[mail-ingest] thread create failed:', error.message)
          return notFound()
        }
        threadId = winner.id as string
      } else {
        threadId = created.id as string
      }
    }
  }

  // 3. File the message. A duplicate is a success: the caller asked us to make
  //    sure this message is stored, and it is.
  const { error: insertError } = await supabase.from('mail_messages').insert({
    thread_id: threadId,
    direction: 'inbound',
    dedupe_hash: message.dedupe_hash,
    message_id: message.message_id,
    in_reply_to: message.in_reply_to,
    reference_ids: message.reference_ids,
    from_email: message.from_email,
    from_header: message.from_header,
    to_email: message.to_email,
    subject: message.subject,
    body_text: message.body_text,
    body_html: message.body_html,
    truncated: message.truncated,
    attachments: message.attachments,
    auth_results: message.auth_results,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return Response.json({ ok: true, stored: false, reason: 'duplicate' })
    }
    console.error('[mail-ingest] message insert failed:', insertError.message)
    return notFound()
  }

  // 4. Surface the thread and keep its displayed subject current — a person
  //    scanning the list should see what the conversation is called now, not
  //    what it was called when it started.
  await supabase
    .from('mail_threads')
    .update({ last_message_at: new Date().toISOString(), subject: threadTitle(message.subject) })
    .eq('id', threadId)

  return Response.json({ ok: true, stored: true })
})
