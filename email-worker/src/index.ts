// Cloudflare Email Worker for hello@orchestra-automation.com.
//
// The domain's MX already points at Cloudflare Email Routing, which forwards
// this address to the owner's personal mailbox. This Worker sits on that route
// and does two things, in this order and for this reason:
//
//   1. FORWARD, exactly as before. Non-negotiable, and first. The mailbox is
//      the system of record for mail; /admin is a convenience built on top of
//      it. If step 2 breaks — bad secret, Supabase down, a bug in this file —
//      support mail must still arrive where it has always arrived.
//   2. Parse and POST to the mail-ingest Edge Function, so the same message is
//      readable as a thread in /admin.
//
// Step 2 can never take step 1 down with it: it is wrapped, its failures are
// logged and swallowed, and it runs after the forward has been awaited.
//
// The one thing that DOES throw is a broken forward. Throwing from an email
// handler makes Cloudflare defer the message and the sending MTA retry, which
// is the right failure: mail is delayed and loudly broken rather than quietly
// swallowed. Silently dropping a customer's support request is the one outcome
// this Worker must not produce.

import { buildIngestPayload, type ParsedEmail, signRequest } from './payload'
import PostalMime from 'postal-mime'

export interface Env {
  // Where mail is forwarded — the owner's personal mailbox. A SECRET, not a
  // var: this is a personal address and does not belong in a file that lives in
  // version control. Must be a verified destination in Cloudflare Email
  // Routing, or forward() rejects it.
  FORWARD_TO: string
  // Full URL of the ingest function, e.g.
  // https://<project-ref>.supabase.co/functions/v1/mail-ingest
  INGEST_URL: string
  // Shared with the Supabase function as MAIL_INGEST_SECRET. Not the website's
  // ADMIN_DATA_SECRET: this is a different trust domain, and a compromise here
  // must not become a read of the purchase table.
  MAIL_INGEST_SECRET: string
}

// Cloudflare's ForwardableEmailMessage, narrowed to what is used here. Declared
// locally rather than pulled from @cloudflare/workers-types so this file
// type-checks in a bare checkout with no install step.
interface ForwardableEmailMessage {
  readonly from: string
  readonly to: string
  readonly headers: Headers
  readonly raw: ReadableStream<Uint8Array>
  readonly rawSize: number
  forward(rcptTo: string, headers?: Headers): Promise<void>
}

// Above any real support email and well below what a Worker can hold. A message
// larger than this is forwarded and not ingested: /admin loses one entry, the
// mailbox loses nothing.
const MAX_RAW_BYTES = 2 * 1024 * 1024

const INGEST_TIMEOUT_MS = 10_000

async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) return null
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

async function ingest(message: ForwardableEmailMessage, env: Env): Promise<void> {
  if (!env.INGEST_URL || !env.MAIL_INGEST_SECRET) {
    console.log('[email-worker] ingest not configured — forwarded only')
    return
  }
  if (message.rawSize > MAX_RAW_BYTES) {
    console.log(`[email-worker] ${message.rawSize} bytes is over the cap — forwarded only`)
    return
  }

  const raw = await readCapped(message.raw, MAX_RAW_BYTES)
  if (!raw) {
    console.log('[email-worker] raw message exceeded the cap mid-read — forwarded only')
    return
  }

  // postal-mime does the MIME work: multipart walking, transfer-encoding,
  // charset conversion, header unfolding and RFC 2047 word decoding. Hand-rolling
  // that against input a stranger controls is exactly the wrong place to save a
  // dependency.
  const parsed = (await new PostalMime().parse(raw)) as ParsedEmail

  const body = JSON.stringify(
    buildIngestPayload({
      envelopeFrom: message.from,
      envelopeTo: message.to,
      authResults: message.headers.get('authentication-results'),
      parsed,
    }),
  )

  const headers = await signRequest(env.MAIL_INGEST_SECRET, 'POST', env.INGEST_URL, body)
  const res = await fetch(env.INGEST_URL, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
  })

  // The endpoint 404s every failure by design, so the status cannot say whether
  // the signature was wrong or the payload was. It is still worth logging: a
  // run of 404s here is the signal that the two secrets have drifted apart.
  if (!res.ok) console.error(`[email-worker] ingest rejected (${res.status})`)
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (!env.FORWARD_TO) {
      // Deliberately fatal. Without a destination there is nowhere for this
      // mail to go, and a silent success would lose it; throwing defers the
      // message so the sender's MTA retries once this is fixed.
      throw new Error('FORWARD_TO is unset — refusing to accept mail with nowhere to forward it')
    }

    // First, and awaited. Everything below is best-effort; this is not.
    await message.forward(env.FORWARD_TO)

    try {
      await ingest(message, env)
    } catch (err) {
      // Swallowed on purpose. The message is already delivered; failing here
      // would defer a mail that has, in the only sense that matters, arrived —
      // and would make every ingest bug into a bounced support request.
      console.error('[email-worker] ingest failed:', err instanceof Error ? err.message : err)
    }
  },
}
