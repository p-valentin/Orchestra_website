// The ENTIRE Polar surface lives in this module (design §2.1) — signature
// scheme, payload field paths, and the account binding. Swap the provider and
// only this file plus the webhook handler change. Mirrors _shared/paddle.ts.
//
// Wire format (Polar, via the Standard Webhooks spec):
//   - Headers: `webhook-id`, `webhook-timestamp` (unix seconds),
//     `webhook-signature`. The signature header is a SPACE-delimited list of
//     `v1,<base64>` entries (multiple during secret rotation — any match
//     passes); non-`v1` versions are ignored. The signed content is
//     "<webhook-id>.<webhook-timestamp>.<raw body>", HMAC-SHA256, and the
//     digest is BASE64 (Paddle used hex). ts is checked against a freshness
//     window; Polar re-signs every delivery attempt.
//   - Key derivation, the one real gotcha: Polar's docs say "the webhook
//     secret is expected to be base64 encoded", but their SDK's validateEvent
//     does base64(utf8(secret)) and hands that to standardwebhooks, whose
//     constructor base64-DECODES it. The two cancel: the HMAC key is the plain
//     UTF-8 bytes of the secret exactly as shown in the Polar dashboard. Set
//     POLAR_WEBHOOK_SECRET to that literal string — pre-encoding it yields
//     silent 401s. (A `whsec_`-prefixed secret is also accepted, per the
//     Standard Webhooks serialization, in case Polar ever hands one out.)
//   - Payload: { type, timestamp, data: {...} } — note there is NO event id in
//     the body. The `webhook-id` HEADER is the idempotency key; the spec
//     guarantees it is stable across retries of the same event.
//     order.paid carries data.id (the order), data.customer.email, and
//     data.metadata (copied from the checkout session). Refunds arrive as
//     order.refunded (data = the Order) and refund.created/updated
//     (data = the Refund, whose data.order_id points back).

import { normalizeEmail } from './util.ts'

export const POLAR_SIGNATURE_TOLERANCE_SECONDS = 300

// Standard Webhooks serializes symmetric secrets as base64 with a `whsec_`
// prefix. Polar shows a raw string instead, so the UTF-8 bytes are the key —
// but decode the prefixed form too rather than silently HMAC-ing the literal
// "whsec_..." text, which would fail in a way that looks like a wrong secret.
function secretKeyBytes(secret: string): Uint8Array<ArrayBuffer> {
  if (secret.startsWith('whsec_')) {
    try {
      return Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0))
    } catch {
      // Not valid base64 after the prefix — fall through to the literal bytes.
    }
  }
  return new TextEncoder().encode(secret)
}

function base64ToBytes(b64: string): Uint8Array | null {
  // Reject anything that isn't standard base64 before atob, which is lenient
  // about some malformed input.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

export interface PolarSignatureHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

// Pulls the three Standard Webhooks headers. Header names are case-insensitive
// per the fetch API, but read them lowercase to match the spec exactly.
export function polarSignatureHeaders(headers: Headers): PolarSignatureHeaders {
  return {
    id: headers.get('webhook-id'),
    timestamp: headers.get('webhook-timestamp'),
    signature: headers.get('webhook-signature'),
  }
}

// Verified BEFORE any JSON parse, on the exact raw bytes.
// crypto.subtle.verify is constant-time.
export async function verifyPolarSignature(
  rawBody: string,
  headers: PolarSignatureHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers
  // All three are mandatory: without the id or the timestamp the signature
  // covers nothing that pins this delivery, so a missing header is a reject,
  // never a "verify what's left".
  if (!id || !timestamp || !signature || !secret) return false
  if (!/^\d+$/.test(timestamp)) return false

  const ts = Number(timestamp)
  if (Math.abs(nowSeconds - ts) > POLAR_SIGNATURE_TOLERANCE_SECONDS) return false

  const candidates: Uint8Array[] = []
  for (const entry of signature.split(' ')) {
    if (entry === '') continue
    const comma = entry.indexOf(',')
    if (comma === -1) continue
    // Only the symmetric HMAC scheme. `v1a` (ed25519) and anything unknown is
    // skipped rather than trusted.
    if (entry.slice(0, comma) !== 'v1') continue
    const bytes = base64ToBytes(entry.slice(comma + 1))
    if (bytes) candidates.push(bytes)
  }
  if (candidates.length === 0) return false

  const key = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signed = new TextEncoder().encode(`${id}.${ts}.${rawBody}`)
  for (const candidate of candidates) {
    if (await crypto.subtle.verify('HMAC', key, candidate.buffer as ArrayBuffer, signed)) return true
  }
  return false
}

export interface PolarEvent {
  eventType: string
  // order.*: the order id (the idempotency scope for licenses);
  // refund.*: the REFUNDED order's id, read from data.order_id.
  orderId: string | null
  orderStatus: string | null // order.* only: draft|pending|paid|refunded|partially_refunded|void
  customerEmail: string | null // order.* only, normalized
  // order.* only: set when the order belongs to a subscription. We sell a
  // one-time lifetime license, so a non-null value means this order is not ours
  // to license.
  subscriptionId: string | null
  // order.* only: Polar's human-friendly reference — what a buyer can quote to
  // support. The order id is machine-facing; this is the one on their receipt.
  invoiceNumber: string | null
  refundStatus: string | null // refund.* only: pending|succeeded|failed|canceled
  // metadata.user_id, set server-side when opening checkout for a signed-in
  // buyer. Binds the purchase to that account regardless of the email typed
  // into Polar, so a changed email can't misdirect the license. This is the
  // ONLY attach path — there is deliberately no email fallback here.
  metadataUserId: string | null
}

// Tolerant extraction: missing fields become null and the handler decides what
// is processable — a malformed-but-signed payload must never crash it.
// deno-lint-ignore no-explicit-any
export function parsePolarEvent(payload: any): PolarEvent {
  const eventType = typeof payload?.type === 'string' ? payload.type : 'unknown'
  const data = payload?.data ?? {}
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

  const isRefund = eventType.startsWith('refund.')
  const isOrder = eventType.startsWith('order.')
  return {
    eventType,
    orderId: isRefund ? str(data.order_id) : isOrder ? str(data.id) : null,
    orderStatus: isOrder ? str(data.status) : null,
    customerEmail: isOrder && str(data.customer?.email) ? normalizeEmail(data.customer.email) : null,
    subscriptionId: isOrder ? str(data.subscription_id) : null,
    invoiceNumber: isOrder ? str(data.invoice_number) : null,
    refundStatus: isRefund ? str(data.status) : null,
    metadataUserId: str(data.metadata?.user_id),
  }
}
