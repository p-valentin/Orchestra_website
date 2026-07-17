// The ENTIRE Paddle surface lives in this module (design §2.1) — signature
// scheme, payload field paths, and the customer-email lookup. Swap the
// provider and only this file plus the webhook handler change.
//
// Wire format (Paddle Billing):
//   - Paddle-Signature header: `ts=<unix seconds>;h1=<hex>` where h1 is
//     HMAC-SHA256 over "<ts>:<raw body>" with the notification destination's
//     secret (pdl_ntfset_…). h1 may appear more than once during secret
//     rotation — any match passes. ts is checked against a freshness window
//     (Paddle re-signs every delivery attempt, so retries always carry a
//     fresh ts).
//   - Payload: { event_id, event_type, occurred_at, data: {...} }.
//     transactions carry data.id (txn_…) + data.customer_id (ctm_…) but NOT
//     the buyer email; customer.created/updated carry data.id + data.email;
//     refunds arrive as adjustment.* with data.action="refund",
//     data.status ("approved" is the actionable one) and data.transaction_id.

import { normalizeEmail } from './util.ts'

export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// Verified BEFORE any JSON parse, on the exact raw bytes.
// crypto.subtle.verify is constant-time.
export async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!signatureHeader || !secret) return false

  let ts: number | null = null
  const h1s: Uint8Array[] = []
  for (const part of signatureHeader.split(';')) {
    const [k, v] = part.split('=', 2).map((s) => s?.trim())
    if (k === 'ts' && v && /^\d+$/.test(v)) ts = Number(v)
    if (k === 'h1' && v) {
      const bytes = hexToBytes(v)
      if (bytes) h1s.push(bytes)
    }
  }
  if (ts === null || h1s.length === 0) return false
  if (Math.abs(nowSeconds - ts) > PADDLE_SIGNATURE_TOLERANCE_SECONDS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signed = new TextEncoder().encode(`${ts}:${rawBody}`)
  for (const h1 of h1s) {
    if (await crypto.subtle.verify('HMAC', key, h1.buffer as ArrayBuffer, signed)) return true
  }
  return false
}

export interface PaddleEvent {
  eventType: string
  // transaction.*: the transaction id; adjustment.*: the REFUNDED transaction
  // id; customer.*: the customer id. This is the idempotency scope.
  entityId: string | null
  transactionStatus: string | null // transaction.* only
  customerId: string | null // transaction.* / customer.*
  customerEmail: string | null // customer.* only, normalized
  adjustmentAction: string | null // adjustment.* only, e.g. "refund"
  adjustmentStatus: string | null // adjustment.* only, e.g. "approved"
  // transaction.* only: Paddle's human-friendly invoice reference
  // (e.g. "113783-10001") — what a buyer can quote to support. The txn id is
  // machine-facing; this is the one that appears on their receipt.
  invoiceNumber: string | null
  // custom_data.user_id we set when opening checkout for a signed-in buyer.
  // Binds the purchase to that account regardless of the email they type into
  // Paddle, so a changed email can't misdirect the license.
  customUserId: string | null
}

// Tolerant extraction: missing fields become null and the handler decides
// what is processable — a malformed-but-signed payload must never crash it.
// deno-lint-ignore no-explicit-any
export function parsePaddleEvent(payload: any): PaddleEvent {
  const eventType = typeof payload?.event_type === 'string' ? payload.event_type : 'unknown'
  const data = payload?.data ?? {}
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

  const isAdjustment = eventType.startsWith('adjustment.')
  const isCustomer = eventType.startsWith('customer.')
  return {
    eventType,
    entityId: isAdjustment ? str(data.transaction_id) : str(data.id),
    transactionStatus: str(data.status),
    customerId: isCustomer ? str(data.id) : str(data.customer_id),
    customerEmail: isCustomer && str(data.email) ? normalizeEmail(data.email) : null,
    adjustmentAction: isAdjustment ? str(data.action) : null,
    adjustmentStatus: isAdjustment ? str(data.status) : null,
    invoiceNumber: str(data.invoice_number),
    customUserId: str(data.custom_data?.user_id),
  }
}

// API fallback for buyer email when no customer.* event was stored (e.g. a
// returning customer whose customer.created predates this system). Needs
// PADDLE_API_KEY; base URL is https://api.paddle.com or
// https://sandbox-api.paddle.com (PADDLE_API_BASE_URL).
export async function fetchCustomerEmail(
  baseUrl: string,
  apiKey: string,
  customerId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // A hung upstream would otherwise stall the webhook until the platform
      // wall-clock kill — the window that strands its idempotency slot.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      await res.body?.cancel()
      return null
    }
    const body = await res.json()
    const email = body?.data?.email
    return typeof email === 'string' && email !== '' ? normalizeEmail(email) : null
  } catch {
    return null
  }
}
