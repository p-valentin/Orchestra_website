// The ENTIRE Lemon Squeezy surface lives in this module (design §2.1): the
// signature scheme and the payload field paths. Swap the provider and only
// this file plus the webhook handler change — the license system never
// mentions LS.
//
// Wire format (per LS docs; re-verified in the §7 test-mode run since the
// docs site blocks automated fetches):
//   - X-Signature: hex HMAC-SHA256 of the RAW request body with the store's
//     webhook signing secret
//   - X-Event-Name: e.g. "order_created"; also in payload meta.event_name
//   - JSON:API payload: data.id = order id, data.attributes.{user_email,
//     status, order_number}

import { normalizeEmail } from './util.ts'

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// Verified BEFORE any JSON parse, on the exact raw bytes (§3.1).
// crypto.subtle.verify is constant-time.
export async function verifyLsSignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  if (!signatureHex || !secret) return false
  const sig = hexToBytes(signatureHex.trim())
  if (!sig) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return await crypto.subtle.verify('HMAC', key, sig.buffer as ArrayBuffer, new TextEncoder().encode(rawBody))
}

export interface LsEvent {
  eventName: string
  orderId: string | null
  buyerEmail: string | null // normalized
  orderStatus: string | null
  orderNumber: number | null
}

// Tolerant extraction: missing fields become null and the handler decides
// what is processable — a malformed-but-signed payload must never crash it.
// deno-lint-ignore no-explicit-any
export function parseLsEvent(payload: any, headerEventName: string | null): LsEvent {
  const meta = payload?.meta
  const attributes = payload?.data?.attributes
  const rawId = payload?.data?.id
  const rawEmail = attributes?.user_email
  return {
    eventName: headerEventName || (typeof meta?.event_name === 'string' ? meta.event_name : 'unknown'),
    orderId: typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : null,
    buyerEmail: typeof rawEmail === 'string' && rawEmail.trim() !== '' ? normalizeEmail(rawEmail) : null,
    orderStatus: typeof attributes?.status === 'string' ? attributes.status : null,
    orderNumber: typeof attributes?.order_number === 'number' ? attributes.order_number : null,
  }
}
