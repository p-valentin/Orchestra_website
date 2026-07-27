// Unit tests for the Polar surface module (no stack needed).

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import {
  parsePolarEvent,
  polarSignatureHeaders,
  verifyPolarSignature,
} from '../../functions/_shared/polar.ts'
import { signPolarWebhook } from '../helpers.ts'

const SECRET = 'polar_whs_test_secret'

// The handler reads headers off a Headers object; go through the same path the
// function does rather than hand-building the shape.
function headersOf(record: Record<string, string>) {
  return polarSignatureHeaders(new Headers(record))
}

Deno.test('correct signature verifies; wrong secret / tampered body / tampered id do not', async () => {
  const body = JSON.stringify({ type: 'order.paid' })
  const h = await signPolarWebhook(SECRET, body)

  assert(await verifyPolarSignature(body, headersOf(h), SECRET))
  assertFalse(await verifyPolarSignature(body, headersOf(h), 'other-secret'))
  assertFalse(await verifyPolarSignature(body + ' ', headersOf(h), SECRET))
  // webhook-id is part of the signed content, so swapping it breaks the MAC.
  // This is what stops a valid delivery being replayed under a fresh event id
  // to defeat the idempotency key.
  assertFalse(
    await verifyPolarSignature(body, headersOf({ ...h, 'webhook-id': 'msg_other' }), SECRET),
  )
  // …as is the timestamp.
  assertFalse(
    await verifyPolarSignature(
      body,
      headersOf({ ...h, 'webhook-timestamp': String(Math.floor(Date.now() / 1000) - 30) }),
      SECRET,
    ),
  )
})

Deno.test('all three headers are mandatory — a missing one is a reject, not a partial verify', async () => {
  const body = '{}'
  const h = await signPolarWebhook(SECRET, body)
  for (const missing of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    const partial = { ...h }
    delete partial[missing]
    assertFalse(await verifyPolarSignature(body, headersOf(partial), SECRET), `should reject without ${missing}`)
  }
  assertFalse(await verifyPolarSignature(body, headersOf({}), SECRET))
})

Deno.test('stale and future timestamps are rejected even with a valid MAC (replay window)', async () => {
  const body = '{}'
  const now = Math.floor(Date.now() / 1000)

  const old = await signPolarWebhook(SECRET, body, { ts: now - 3600 })
  assertFalse(await verifyPolarSignature(body, headersOf(old), SECRET))
  // …but the same signature is fine when "now" is inside the window.
  assert(await verifyPolarSignature(body, headersOf(old), SECRET, now - 3600 + 60))

  // A clock-skewed-forward delivery is equally suspect.
  const future = await signPolarWebhook(SECRET, body, { ts: now + 3600 })
  assertFalse(await verifyPolarSignature(body, headersOf(future), SECRET))
})

Deno.test('space-delimited signature list (secret rotation): any v1 match passes', async () => {
  const body = '{"a":1}'
  const h = await signPolarWebhook(SECRET, body)
  const good = h['webhook-signature']
  const stale = `v1,${btoa('x'.repeat(32))}`

  assert(await verifyPolarSignature(body, headersOf({ ...h, 'webhook-signature': `${stale} ${good}` }), SECRET))
  assert(await verifyPolarSignature(body, headersOf({ ...h, 'webhook-signature': `${good} ${stale}` }), SECRET))
})

Deno.test('non-v1 signature versions are skipped, never trusted', async () => {
  const body = '{"a":1}'
  const h = await signPolarWebhook(SECRET, body)
  const payload = h['webhook-signature'].slice('v1,'.length)

  // The asymmetric scheme (v1a) and unknown versions must not be accepted just
  // because the bytes happen to match our HMAC.
  for (const version of ['v1a', 'v2', 'v0', '']) {
    assertFalse(
      await verifyPolarSignature(body, headersOf({ ...h, 'webhook-signature': `${version},${payload}` }), SECRET),
      `should reject version ${JSON.stringify(version)}`,
    )
  }
})

Deno.test('garbage signature headers are rejected without crashing', async () => {
  const body = '{}'
  const ts = String(Math.floor(Date.now() / 1000))
  const bad = ['', 'v1,', 'v1', ',', 'not-base64!!', 'v1,!!!!', 'v1,' + 'A'.repeat(1000)]
  for (const signature of bad) {
    assertFalse(
      await verifyPolarSignature(body, headersOf({ 'webhook-id': 'msg_1', 'webhook-timestamp': ts, 'webhook-signature': signature }), SECRET),
      `should reject: ${JSON.stringify(signature)}`,
    )
  }
  // Values a real Headers object can't even hold (non-ByteString) — fed
  // straight to the verifier, since a hand-rolled caller could pass anything.
  assertFalse(await verifyPolarSignature(body, { id: 'msg_1', timestamp: ts, signature: '😀' }, SECRET))
  assertFalse(await verifyPolarSignature(body, { id: '😀', timestamp: ts, signature: 'v1,AAAA' }, SECRET))

  // Non-numeric timestamps must not become NaN comparisons that pass.
  const h = await signPolarWebhook(SECRET, body)
  for (const timestamp of ['abc', '', '12.5', '-1e9', ' 123']) {
    assertFalse(
      await verifyPolarSignature(body, headersOf({ ...h, 'webhook-timestamp': timestamp }), SECRET),
      `should reject ts ${JSON.stringify(timestamp)}`,
    )
  }
})

Deno.test('an empty secret never verifies (unset POLAR_WEBHOOK_SECRET must fail closed)', async () => {
  // A perfectly-formed delivery must still be rejected when the function has
  // no secret configured — the failure mode of a missing env var has to be
  // "reject everything", never "accept everything".
  const body = '{}'
  const h = await signPolarWebhook(SECRET, body)
  assertFalse(await verifyPolarSignature(body, headersOf(h), ''))
})

Deno.test('a whsec_-prefixed secret is keyed on its LITERAL bytes, prefix included', async () => {
  // Polar issues secrets like whsec_ovyN6cPrTv56AApvz… and signs with the
  // whole string's UTF-8 bytes: validateEvent base64-encodes the secret before
  // the Standard Webhooks library base64-decodes it, so that library's
  // prefix-stripping branch never fires (base64 output has no `_`).
  //
  // Stripping the prefix and decoding — what a plain Standard Webhooks
  // consumer does — yields a DIFFERENT key and 401s every real delivery. This
  // test pins the Polar-correct behaviour.
  // Self-evidently fake, and built rather than pasted so no secret scanner
  // mistakes a test fixture for a live credential.
  const secret = `whsec_${btoa('test-only-never-a-real-secret')}`
  const body = '{"a":1}'
  const h = await signPolarWebhook(secret, body)
  assert(await verifyPolarSignature(body, headersOf(h), secret), 'literal bytes must verify')

  // The tempting-but-wrong derivation must NOT be accepted.
  const stripped = secret.slice('whsec_'.length)
  const wrong = await signPolarWebhook(atob(stripped + '='.repeat((4 - stripped.length % 4) % 4)), body)
  assertFalse(
    await verifyPolarSignature(body, headersOf(wrong), secret),
    'base64-decoding the prefix must not verify',
  )
})

Deno.test('parsePolarEvent: order.paid fields', () => {
  const event = parsePolarEvent({
    type: 'order.paid',
    timestamp: '2026-07-27T10:00:00Z',
    data: {
      id: 'ord_123',
      status: 'paid',
      paid: true,
      invoice_number: 'ORCH-0001',
      subscription_id: null,
      customer: { id: 'cus_1', email: '  Buyer@Example.COM ' },
      metadata: { user_id: '11111111-1111-4111-8111-111111111111' },
    },
  })
  assertEquals(event.eventType, 'order.paid')
  assertEquals(event.orderId, 'ord_123')
  assertEquals(event.orderStatus, 'paid')
  assertEquals(event.customerEmail, 'buyer@example.com')
  assertEquals(event.subscriptionId, null)
  assertEquals(event.invoiceNumber, 'ORCH-0001')
  assertEquals(event.metadataUserId, '11111111-1111-4111-8111-111111111111')
})

Deno.test('parsePolarEvent: refund.* reads order_id, not id', () => {
  const event = parsePolarEvent({
    type: 'refund.created',
    data: { id: 'ref_9', order_id: 'ord_123', status: 'succeeded', amount: 14900 },
  })
  assertEquals(event.orderId, 'ord_123', 'the refund id is not the license key — order_id is')
  assertEquals(event.refundStatus, 'succeeded')
  assertEquals(event.customerEmail, null)
})

Deno.test('parsePolarEvent: malformed payloads degrade to nulls instead of throwing', () => {
  for (const payload of [null, undefined, {}, { type: 'order.paid' }, { type: 42, data: 'nope' }, []]) {
    const event = parsePolarEvent(payload)
    assertEquals(typeof event.eventType, 'string')
    assertEquals(event.orderId, null)
    assertEquals(event.metadataUserId, null)
  }
})

Deno.test('parsePolarEvent: a non-string metadata.user_id never becomes an attach candidate', () => {
  // A signed-but-hostile payload must not smuggle an object/array through to
  // the FK, and an empty string must not read as "present".
  for (const user_id of [42, true, null, {}, [], '', { toString: () => 'x' }]) {
    const event = parsePolarEvent({ type: 'order.paid', data: { id: 'ord_1', metadata: { user_id } } })
    assertEquals(event.metadataUserId, null, `should reject metadata.user_id ${JSON.stringify(user_id)}`)
  }
})
