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
//     UTF-8 bytes of the secret exactly as stored. Set POLAR_WEBHOOK_SECRET to
//     that literal string — pre-encoding it yields silent 401s.
//     Polar issues secrets in the Standard Webhooks `whsec_<base64>` form
//     (confirmed against a real sandbox endpoint, 2026-07-27). Do NOT strip and
//     decode that prefix the way a plain Standard Webhooks consumer would: the
//     prefix is part of the signed key here. See secretKeyBytes below.
//   - Payload: { type, timestamp, data: {...} } — note there is NO event id in
//     the body. The `webhook-id` HEADER is the idempotency key; the spec
//     guarantees it is stable across retries of the same event.
//     order.paid carries data.id (the order), data.customer.email, and
//     data.metadata (copied from the checkout session). Refunds arrive as
//     order.refunded (data = the Order) and refund.created/updated
//     (data = the Refund, whose data.order_id points back).

import { normalizeEmail } from './util.ts'

export const POLAR_SIGNATURE_TOLERANCE_SECONDS = 300

// The HMAC key is the UTF-8 bytes of the secret string EXACTLY as stored,
// including any `whsec_` prefix. Do not be tempted to strip and base64-decode
// the prefix the way plain Standard Webhooks consumers do — Polar's
// validateEvent base64-ENCODES the secret before handing it to the reference
// library, whose constructor then base64-decodes it. Since base64 output never
// contains `_`, that library's `whsec_` branch is unreachable for Polar and the
// two transforms cancel to "the literal bytes". Stripping the prefix here would
// derive a different key from the one Polar signs with, and every delivery
// would 401 for no visible reason.
function secretKeyBytes(secret: string): Uint8Array<ArrayBuffer> {
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

// ---------- outbound API ----------

// POLAR_API_BASE_URL exists so the integration suite can point the refund call
// at a local mock: the money-moving path is exactly the one that must not be
// left untested because it is inconvenient to test. Unset in production, where
// POLAR_ENV picks sandbox or live.
export function polarApiBase(): string {
  const override = Deno.env.get('POLAR_API_BASE_URL')
  if (override) return override.replace(/\/$/, '')
  return Deno.env.get('POLAR_ENV') === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh'
}

export interface RefundResult {
  ok: boolean
  refundId?: string
  // Set when ok is false. Surfaced to the buyer only as a generic failure —
  // this string is for logs and the owner alert, never for the browser.
  error?: string
  // True when Polar says this order can no longer be refunded (already
  // refunded, or outside its window). Distinguished because it is NOT a
  // transient failure and must not invite a retry.
  permanent?: boolean
}

// Issues a full refund for an order. `reason` is Polar's own enum, which is
// deliberately narrower than ours: every buyer-initiated refund is a
// customer_request as far as the processor is concerned, and our richer reason
// lives in refund_requests where it is useful to us.
//
// revoke_benefits is true so Polar tears down anything it granted; Orchestra's
// own entitlement still comes off the order.refunded webhook, not from here.
export async function createRefund(opts: {
  apiKey: string
  orderId: string
  amountCents: number
  comment?: string
}): Promise<RefundResult> {
  try {
    const res = await fetch(`${polarApiBase()}/v1/refunds/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      // A hung processor must not hold the request open until the platform
      // kill — the buyer is watching a spinner over their own money.
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        order_id: opts.orderId,
        reason: 'customer_request',
        amount: opts.amountCents,
        revoke_benefits: true,
        ...(opts.comment ? { comment: opts.comment.slice(0, 500) } : {}),
      }),
    })

    if (res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: true, refundId: typeof body?.id === 'string' ? body.id : undefined }
    }

    const text = await res.text().catch(() => '')
    // 422 is Polar's validation failure — nothing refundable left, amount too
    // large, order not refundable. Retrying cannot help.
    return { ok: false, error: `${res.status} ${text.slice(0, 300)}`, permanent: res.status === 422 || res.status === 404 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
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
  // Minor units + ISO currency, for the confirmation/refund emails. order.*
  // reports the order total; refund.* reports the refunded amount.
  amountCents: number | null
  currency: string | null
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
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  // What the CUSTOMER sees on their statement, which is the only figure worth
  // putting in an email to them.
  //
  // Polar reports refunds net of tax (`amount`) with the tax alongside
  // (`tax_amount`) and returns both to the buyer. Reporting `amount` alone told
  // someone who paid $1.00 that they had been refunded $0.83 — which reads as
  // being short-changed and earns a support ticket, or worse, a chargeback.
  // Orders are already tax-inclusive in `total_amount`.
  const refundTotal = isRefund
    ? (num(data.amount) ?? 0) + (num(data.tax_amount) ?? 0)
    : null

  return {
    amountCents: isRefund ? (refundTotal || null) : num(data.total_amount),
    currency: str(data.currency),
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
